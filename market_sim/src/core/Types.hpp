#pragma once

#include <string>
#include <cstdint>
#include <chrono>
#include <optional>
#include <vector>
#include <map>

namespace market {

    using Price = double;
    using Volume = int64_t;
    using Timestamp = uint64_t;
    using AgentId = uint64_t;
    using OrderId = uint64_t;

    enum class OrderSide {
        BUY,
        SELL
    };

    enum class OrderType {
        MARKET,
        LIMIT
    };

    enum class NewsCategory {
        GLOBAL,      // Economic conditions affecting all commodities
        POLITICAL,   // Trade policy, tariffs, regulations
        SUPPLY,      // Supply-side events (per commodity)
        DEMAND       // Demand-side events (per commodity)
    };

    enum class NewsSentiment {
        POSITIVE,
        NEGATIVE,
        NEUTRAL
    };

    struct Order {
        OrderId id;
        AgentId agentId;
        std::string symbol;
        OrderSide side;
        OrderType type;
        Price price;
        Volume quantity;
        Timestamp timestamp;

        bool operator<(const Order& other) const {
            return timestamp < other.timestamp;
        }
    };

    struct Trade {
        OrderId buyOrderId;
        OrderId sellOrderId;
        AgentId buyerId;
        AgentId sellerId;
        std::string buyerType;
        std::string sellerType;
        std::string symbol;
        Price price;
        Volume quantity;
        Timestamp timestamp;
    };

    struct AgentTypeStats {
        uint64_t ordersPlaced = 0;
        uint64_t buyOrders = 0;
        uint64_t sellOrders = 0;
        uint64_t fills = 0;
        double volumeTraded = 0;
        double cashSpent = 0;
        double cashReceived = 0;
    };

    struct NewsEvent {
        NewsCategory category;
        NewsSentiment sentiment;
        std::string symbol;         // Target commodity (OIL, STEEL, etc.)
        std::string commodityName;  // Human-readable name
        std::string subcategory;    // e.g., "production", "logistics", "consumption"
        double magnitude;           // Impact size [0, 1]
        Timestamp timestamp;
        std::string headline;
    };

    struct Candle {
        Timestamp time;
        Price open;
        Price high;
        Price low;
        Price close;
        double volume;

        bool isValid() const { return time > 0 && open > 0; }
    };

    struct SupplyDemand {
        double production = 0.0;    // Current production level
        double imports = 0.0;       // Import volume
        double exports = 0.0;       // Export volume
        double consumption = 0.0;   // Current consumption level
        double inventory = 0.0;     // Inventory/stockpile level

        double getTotalSupply() const {
            return production + imports - exports;
        }

        double getTotalDemand() const {
            return consumption;
        }

        // Flow-based imbalance: positive = excess demand, negative = excess supply
        // Symmetric around zero, does NOT include inventory (which would create
        // a permanent bias). Inventory info is available separately for agents
        // that want to use it.
        double getImbalance() const {
            double avg = (production + consumption) / 2.0;
            if (avg <= 0) return 0.0;
            return (consumption - production) / avg;
        }

        // Inventory pressure: >1 means excess inventory, <1 means shortage
        double getInventoryRatio(double baseInventory) const {
            if (baseInventory <= 0) return 1.0;
            return inventory / baseInventory;
        }
    };

    struct CrossEffect {
        std::string targetSymbol;
        double coefficient;  // How much target price moves per 1% source price change
    };

    struct MarketState {
        std::map<std::string, Price> prices;
        std::map<std::string, SupplyDemand> supplyDemand;
        std::map<std::string, std::vector<Price>> priceHistory;
        std::map<std::string, Volume> volumes;
        std::map<std::string, std::string> symbolToCategory;
        std::map<std::string, std::vector<CrossEffect>> crossEffects;
        std::vector<NewsEvent> recentNews;
        double globalSentiment;
        double tickScale = 1.0;
        Timestamp currentTime;
    };

    struct AgentParams {
        double riskAversion;
        double reactionSpeed;
        double newsWeight;
        double confidenceLevel;
        int timeHorizon;
    };

    struct Position {
        std::string symbol;
        Volume quantity;
        Price avgCost;
    };

    struct BookLevel {
        Price price;
        Volume totalQuantity;
        int orderCount;
    };

    struct OrderBookSnapshot {
        std::string symbol;
        std::vector<BookLevel> bids;
        std::vector<BookLevel> asks;
        Price bestBid;
        Price bestAsk;
        Price spread;
        Price midPrice;
    };

    struct SimulationMetrics {
        uint64_t totalTicks;
        uint64_t totalTrades;
        uint64_t totalOrders;
        double avgSpread;
        double avgVolatility;
        std::map<std::string, double> returns;
        std::map<std::string, AgentTypeStats> agentTypeStats;
    };

    inline Timestamp now() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }

} // namespace market
