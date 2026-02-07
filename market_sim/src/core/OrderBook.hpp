#pragma once

#include "Types.hpp"
#include "SimClock.hpp"
#include <map>
#include <vector>
#include <queue>
#include <mutex>
#include <functional>

namespace market {

    class OrderBook {
    public:
        explicit OrderBook(const std::string& symbol);

        // Order management
        void addOrder(const Order& order);
        bool cancelOrder(OrderId orderId);

        // Match orders and return executed trades
        std::vector<Trade> matchOrders();

        // Getters
        const std::string& getSymbol() const { return symbol_; }
        Price getBestBid() const;
        Price getBestAsk() const;
        Price getSpread() const;
        Price getMidPrice() const;

        // Get order book snapshot
        OrderBookSnapshot getSnapshot(int depth = 10) const;

        // Clear all orders
        void clear();

        // Statistics
        size_t getBidCount() const { return bids_.size(); }
        size_t getAskCount() const { return asks_.size(); }

        // SimClock integration — set this so timestamps use sim time
        void setSimClock(const SimClock* clock) { simClock_ = clock; }

        // Configurable order expiry (milliseconds of sim time)
        void setMaxOrderAgeMs(Timestamp ms) { maxOrderAgeMs_ = ms; }

    private:
        std::string symbol_;

        // Bid queue: sorted by price (descending), then by time (ascending)
        struct BidComparator {
            bool operator()(const Order& a, const Order& b) const {
                if (a.price != b.price) return a.price < b.price; // Higher price has priority
                return a.timestamp > b.timestamp; // Earlier time has priority
            }
        };

        // Ask queue: sorted by price (ascending), then by time (ascending)
        struct AskComparator {
            bool operator()(const Order& a, const Order& b) const {
                if (a.price != b.price) return a.price > b.price; // Lower price has priority
                return a.timestamp > b.timestamp; // Earlier time has priority
            }
        };

        std::priority_queue<Order, std::vector<Order>, BidComparator> bids_;
        std::priority_queue<Order, std::vector<Order>, AskComparator> asks_;

        // Map for O(1) order lookup for cancellation
        std::map<OrderId, bool> activeOrders_;

        // Thread safety
        mutable std::mutex mutex_;

        // Order ID generator
        static OrderId nextOrderId_;

        // Max order age before expiry (sim-time milliseconds)
        Timestamp maxOrderAgeMs_ = 172800000;  // 2 simulated days in ms

        // SimClock for timestamping (null → falls back to wall-clock now())
        const SimClock* simClock_ = nullptr;

        // Get current timestamp (sim time if available, else wall-clock)
        Timestamp currentTs() const { return simClock_ ? simClock_->currentTimestamp() : now(); }

        // Helper to process market orders
        std::vector<Trade> processMarketOrder(Order& order);

        // Lock-free helpers (must be called with mutex_ already held)
        Price getBestBidUnlocked() const;
        Price getBestAskUnlocked() const;
        Price getSpreadUnlocked() const;
        Price getMidPriceUnlocked() const;
    };

} // namespace market
