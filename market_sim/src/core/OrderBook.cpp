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
        }
        else {
            asks_.push(orderCopy);
        }
    }

    bool OrderBook::cancelOrder(OrderId orderId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = activeOrders_.find(orderId);
        if (it != activeOrders_.end() && it->second) {
            it->second = false;
            return true;
        }
        return false;
    }

    std::vector<Trade> OrderBook::matchOrders() {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<Trade> trades;

        Timestamp currentTime = currentTs();

        // Remove cancelled and expired orders from top
        auto isInvalid = [&](const Order& o) {
            if (!activeOrders_[o.id]) return true;
            if (currentTime > o.timestamp && (currentTime - o.timestamp) > maxOrderAgeMs_) {
                activeOrders_[o.id] = false;
                return true;
            }
            return false;
            };

        while (!bids_.empty() && isInvalid(bids_.top())) {
            bids_.pop();
        }
        while (!asks_.empty() && isInvalid(asks_.top())) {
            asks_.pop();
        }

        // Match while bid >= ask
        while (!bids_.empty() && !asks_.empty()) {
            Order bid = bids_.top();
            Order ask = asks_.top();

            // Skip cancelled or expired orders
            if (!activeOrders_[bid.id] || (currentTime > bid.timestamp && (currentTime - bid.timestamp) > maxOrderAgeMs_)) {
                activeOrders_[bid.id] = false;
                bids_.pop();
                continue;
            }
            if (!activeOrders_[ask.id] || (currentTime > ask.timestamp && (currentTime - ask.timestamp) > maxOrderAgeMs_)) {
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
            trade.timestamp = currentTs();
            trades.push_back(trade);

            // Update order quantities
            bids_.pop();
            asks_.pop();

            if (bid.quantity > execQty) {
                Order remainingBid = bid;
                remainingBid.quantity -= execQty;
                bids_.push(remainingBid);
            }
            else {
                activeOrders_[bid.id] = false;
            }

            if (ask.quantity > execQty) {
                Order remainingAsk = ask;
                remainingAsk.quantity -= execQty;
                asks_.push(remainingAsk);
            }
            else {
                activeOrders_[ask.id] = false;
            }
        }

        return trades;
    }

    // ----- Lock-free helpers (must be called with mutex_ already held) -----

    Price OrderBook::getBestBidUnlocked() const {
        auto bidsCopy = bids_;
        while (!bidsCopy.empty()) {
            if (activeOrders_.count(bidsCopy.top().id) && activeOrders_.at(bidsCopy.top().id)) {
                return bidsCopy.top().price;
            }
            bidsCopy.pop();
        }
        return 0.0;
    }

    Price OrderBook::getBestAskUnlocked() const {
        auto asksCopy = asks_;
        while (!asksCopy.empty()) {
            if (activeOrders_.count(asksCopy.top().id) && activeOrders_.at(asksCopy.top().id)) {
                return asksCopy.top().price;
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
    }

} // namespace market
