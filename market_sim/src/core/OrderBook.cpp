#include "OrderBook.hpp"
#include <algorithm>
#include <limits>

namespace market {

    OrderId OrderBook::nextOrderId_ = 1;

    OrderBook::OrderBook(const std::string& symbol)
        : symbol_(symbol)
    {
    }

    void OrderBook::addOrder(const Order& order) {
        std::lock_guard<std::mutex> lock(mutex_);

        Order orderCopy = order;
        if (orderCopy.id == 0) {
            orderCopy.id = nextOrderId_++;
        }
        orderCopy.timestamp = currentTs();

        activeOrders_[orderCopy.id] = true;

        if (orderCopy.side == OrderSide::BUY) {
            bids_.push(orderCopy);
            orderIdToBidPrice_[orderCopy.id] = orderCopy.price;
            auto it = bestBidByPrice_.find(orderCopy.price);
            if (it == bestBidByPrice_.end()) {
                bestBidByPrice_[orderCopy.price] = orderCopy.id;
            }
        }
        else {
            asks_.push(orderCopy);
            orderIdToAskPrice_[orderCopy.id] = orderCopy.price;
            auto it = bestAskByPrice_.find(orderCopy.price);
            if (it == bestAskByPrice_.end()) {
                bestAskByPrice_[orderCopy.price] = orderCopy.id;
            }
        }
    }

    bool OrderBook::cancelOrder(OrderId orderId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = activeOrders_.find(orderId);
        if (it != activeOrders_.end() && it->second) {
            it->second = false;

            auto bidPriceIt = orderIdToBidPrice_.find(orderId);
            if (bidPriceIt != orderIdToBidPrice_.end()) {
                Price price = bidPriceIt->second;
                orderIdToBidPrice_.erase(bidPriceIt);
                auto bestIt = bestBidByPrice_.find(price);
                if (bestIt != bestBidByPrice_.end() && bestIt->second == orderId) {
                    bestBidByPrice_.erase(bestIt);
                }
            }

            auto askPriceIt = orderIdToAskPrice_.find(orderId);
            if (askPriceIt != orderIdToAskPrice_.end()) {
                Price price = askPriceIt->second;
                orderIdToAskPrice_.erase(askPriceIt);
                auto bestIt = bestAskByPrice_.find(price);
                if (bestIt != bestAskByPrice_.end() && bestIt->second == orderId) {
                    bestAskByPrice_.erase(bestIt);
                }
            }

            return true;
        }
        return false;
    }

    std::vector<Trade> OrderBook::matchOrders() {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<Trade> trades;

        Timestamp currentTime = currentTs();

        auto isExpired = [&](const Order& o) {
            return (currentTime - o.timestamp) > maxOrderAgeMs_;
        };

        // Remove cancelled and expired orders from top
        while (!bids_.empty()) {
            const Order& top = bids_.top();
            if (!activeOrders_[top.id] || isExpired(top)) {
                if (activeOrders_[top.id]) activeOrders_[top.id] = false;
                bids_.pop();
            } else {
                break;
            }
        }
        while (!asks_.empty()) {
            const Order& top = asks_.top();
            if (!activeOrders_[top.id] || isExpired(top)) {
                if (activeOrders_[top.id]) activeOrders_[top.id] = false;
                asks_.pop();
            } else {
                break;
            }
        }

        // Match while bid >= ask
        while (!bids_.empty() && !asks_.empty()) {
            Order bid = bids_.top();
            Order ask = asks_.top();

            // Skip cancelled or expired orders
            if (!activeOrders_[bid.id] || isExpired(bid)) {
                activeOrders_[bid.id] = false;
                bids_.pop();
                continue;
            }
            if (!activeOrders_[ask.id] || isExpired(ask)) {
                activeOrders_[ask.id] = false;
                asks_.pop();
                continue;
            }

            // Check if orders can be matched
            if (bid.price < ask.price && bid.type == OrderType::LIMIT && ask.type == OrderType::LIMIT) {
                break; // No match possible
            }

            // Determine execution price (resting order price)
            Price execPrice;
            if (bid.timestamp < ask.timestamp) {
                execPrice = bid.price; // Bid was resting
            }
            else {
                execPrice = ask.price; // Ask was resting
            }

            // Handle market orders
            if (bid.type == OrderType::MARKET) {
                execPrice = ask.price;
            }
            else if (ask.type == OrderType::MARKET) {
                execPrice = bid.price;
            }

            // Determine execution quantity
            Volume execQty = std::min(bid.quantity, ask.quantity);

            // Create trade
            Trade trade;
            trade.buyOrderId = bid.id;
            trade.sellOrderId = ask.id;
            trade.buyerId = bid.agentId;
            trade.sellerId = ask.agentId;
            trade.symbol = symbol_;
            trade.price = execPrice;
            trade.quantity = execQty;
            trade.timestamp = currentTime;
            trades.push_back(trade);

            // Update order quantities
            bids_.pop();
            asks_.pop();

            // Clean up price indices for filled orders
            bestBidByPrice_.erase(bid.price);
            bestAskByPrice_.erase(ask.price);
            orderIdToBidPrice_.erase(bid.id);
            orderIdToAskPrice_.erase(ask.id);

            if (bid.quantity > execQty) {
                Order remainingBid = bid;
                remainingBid.quantity -= execQty;
                bids_.push(remainingBid);
                orderIdToBidPrice_[remainingBid.id] = remainingBid.price;
                bestBidByPrice_[remainingBid.price] = remainingBid.id;
            }
            else {
                activeOrders_[bid.id] = false;
            }

            if (ask.quantity > execQty) {
                Order remainingAsk = ask;
                remainingAsk.quantity -= execQty;
                asks_.push(remainingAsk);
                orderIdToAskPrice_[remainingAsk.id] = remainingAsk.price;
                bestAskByPrice_[remainingAsk.price] = remainingAsk.id;
            }
            else {
                activeOrders_[ask.id] = false;
            }
        }

        return trades;
    }

    // ----- O(1) best price helpers using cached indices -----

    Price OrderBook::getBestBidUnlocked() const {
        // Try cached best bid first
        while (!bestBidByPrice_.empty()) {
            auto it = bestBidByPrice_.begin(); // highest price (std::greater)
            OrderId id = it->second;
            if (activeOrders_.count(id) && activeOrders_.at(id)) {
                return it->first;
            }
            // Stale entry - remove and continue
            const_cast<OrderBook*>(this)->bestBidByPrice_.erase(it);
        }

        // Fallback: scan queue for valid order
        auto bidsCopy = bids_;
        while (!bidsCopy.empty()) {
            const Order& o = bidsCopy.top();
            if (activeOrders_.count(o.id) && activeOrders_.at(o.id)) {
                // Rebuild index
                const_cast<OrderBook*>(this)->bestBidByPrice_[o.price] = o.id;
                return o.price;
            }
            bidsCopy.pop();
        }
        return 0.0;
    }

    Price OrderBook::getBestAskUnlocked() const {
        // Try cached best ask first
        while (!bestAskByPrice_.empty()) {
            auto it = bestAskByPrice_.begin(); // lowest price
            OrderId id = it->second;
            if (activeOrders_.count(id) && activeOrders_.at(id)) {
                return it->first;
            }
            // Stale entry - remove and continue
            const_cast<OrderBook*>(this)->bestAskByPrice_.erase(it);
        }

        // Fallback: scan queue for valid order
        auto asksCopy = asks_;
        while (!asksCopy.empty()) {
            const Order& o = asksCopy.top();
            if (activeOrders_.count(o.id) && activeOrders_.at(o.id)) {
                // Rebuild index
                const_cast<OrderBook*>(this)->bestAskByPrice_[o.price] = o.id;
                return o.price;
            }
            asksCopy.pop();
        }
        return std::numeric_limits<double>::max();
    }

    Price OrderBook::getSpreadUnlocked() const {
        Price bid = getBestBidUnlocked();
        Price ask = getBestAskUnlocked();
        if (bid > 0 && ask < std::numeric_limits<double>::max()) {
            return ask - bid;
        }
        return 0.0;
    }

    Price OrderBook::getMidPriceUnlocked() const {
        Price bid = getBestBidUnlocked();
        Price ask = getBestAskUnlocked();
        if (bid > 0 && ask < std::numeric_limits<double>::max()) {
            return (bid + ask) / 2.0;
        }
        else if (bid > 0) {
            return bid;
        }
        else if (ask < std::numeric_limits<double>::max()) {
            return ask;
        }
        return 0.0;
    }

    // ----- Public locking wrappers -----

    Price OrderBook::getBestBid() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return getBestBidUnlocked();
    }

    Price OrderBook::getBestAsk() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return getBestAskUnlocked();
    }

    Price OrderBook::getSpread() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return getSpreadUnlocked();
    }

    Price OrderBook::getMidPrice() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return getMidPriceUnlocked();
    }

    OrderBookSnapshot OrderBook::getSnapshot(int depth) const {
        std::lock_guard<std::mutex> lock(mutex_);

        OrderBookSnapshot snapshot;
        snapshot.symbol = symbol_;

        // Aggregate bids
        std::map<Price, Volume, std::greater<Price>> bidLevels;
        auto bidsCopy = bids_;
        while (!bidsCopy.empty()) {
            const Order& o = bidsCopy.top();
            if (activeOrders_.count(o.id) && activeOrders_.at(o.id)) {
                bidLevels[o.price] += o.quantity;
            }
            bidsCopy.pop();
        }

        int count = 0;
        for (const auto& [price, qty] : bidLevels) {
            if (count++ >= depth) break;
            snapshot.bids.push_back({ price, qty, 1 });
        }

        // Aggregate asks
        std::map<Price, Volume> askLevels;
        auto asksCopy = asks_;
        while (!asksCopy.empty()) {
            const Order& o = asksCopy.top();
            if (activeOrders_.count(o.id) && activeOrders_.at(o.id)) {
                askLevels[o.price] += o.quantity;
            }
            asksCopy.pop();
        }

        count = 0;
        for (const auto& [price, qty] : askLevels) {
            if (count++ >= depth) break;
            snapshot.asks.push_back({ price, qty, 1 });
        }

        snapshot.bestBid = getBestBidUnlocked();
        snapshot.bestAsk = getBestAskUnlocked();
        snapshot.spread = getSpreadUnlocked();
        snapshot.midPrice = getMidPriceUnlocked();

        return snapshot;
    }

    void OrderBook::clear() {
        std::lock_guard<std::mutex> lock(mutex_);

        while (!bids_.empty()) bids_.pop();
        while (!asks_.empty()) asks_.pop();
        activeOrders_.clear();
        bestBidByPrice_.clear();
        bestAskByPrice_.clear();
        orderIdToBidPrice_.clear();
        orderIdToAskPrice_.clear();
    }

} // namespace market
