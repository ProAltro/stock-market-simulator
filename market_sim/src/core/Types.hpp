#pragma once

#include <string>
#include <cstdint>
#include <chrono>
#include <optional>
#include <vector>
#include <map>

namespace market {

    // Type aliases
    using Price = double;
    using Volume = int64_t;
    using Timestamp = uint64_t;
    using AgentId = uint64_t;
    using OrderId = uint64_t;

    // Order side
    enum class OrderSide {
        BUY,
        SELL
    };

    // Order type
    enum class OrderType {
        MARKET,
        LIMIT
    };

    // News category
    enum class NewsCategory {
        GLOBAL,
        POLITICAL,
        INDUSTRY,
        COMPANY
    };

    // News sentiment
    enum class NewsSentiment {
        POSITIVE,
        NEGATIVE,
        NEUTRAL
    };

    // Order structure
    struct Order {
        OrderId id;
        AgentId agentId;
        std::string symbol;
        OrderSide side;
        OrderType type;
        Price price;          // For limit orders
        Volume quantity;
        Timestamp timestamp;

        bool operator<(const Order& other) const {
            return timestamp < other.timestamp;
        }
    };

    // Trade (executed order)
    struct Trade {
        OrderId buyOrderId;
        OrderId sellOrderId;
        AgentId buyerId;
        AgentId sellerId;
        std::string buyerType;   // e.g. "FundamentalTrader"
        std::string sellerType;  // e.g. "MarketMaker"
        std::string symbol;
        Price price;
        Volume quantity;
        Timestamp timestamp;
    };

    // Per-agent-type order/trade statistics
    struct AgentTypeStats {
        uint64_t ordersPlaced = 0;
        uint64_t buyOrders = 0;
        uint64_t sellOrders = 0;
        uint64_t fills = 0;
        double volumeTraded = 0;
        double cashSpent = 0;
        double cashReceived = 0;
    };

    // News event
    struct NewsEvent {
        NewsCategory category;
        NewsSentiment sentiment;
        std::string industry;       // For industry news
        std::string symbol;         // For company news
        std::string companyName;    // Human-readable company name
        std::string subcategory;    // e.g. "earnings", "regulation", "trade_policy"
        double magnitude;           // Impact size [-1, 1]
        Timestamp timestamp;
        std::string headline;
    };

    // OHLCV Candle
    struct Candle {
        Timestamp time;       // Start of candle period (epoch ms)
        Price open;
        Price high;
        Price low;
        Price close;
        double volume;

        bool isValid() const { return time > 0 && open > 0; }
    };

    // Market state snapshot for agents
    struct MarketState {
        std::map<std::string, Price> prices;
        std::map<std::string, Price> fundamentals;
        std::map<std::string, std::vector<Price>> priceHistory;
        std::map<std::string, Volume> volumes;
        std::map<std::string, std::string> symbolToIndustry;
        std::vector<NewsEvent> recentNews;
        double globalSentiment;
        double interestRate;
        double tickScale = 1.0;   // ratio of ref tpd to current tpd (1.0 in populate mode)
        Timestamp currentTime;
    };

    // Agent parameters (sampled from distributions)
    struct AgentParams {
        double riskAversion;
        double reactionSpeed;
        double newsWeight;
        double confidenceLevel;
        int timeHorizon;
    };

    // Position in portfolio
    struct Position {
        std::string symbol;
        Volume quantity;
        Price avgCost;
    };

    // Order book level
    struct BookLevel {
        Price price;
        Volume totalQuantity;
        int orderCount;
    };

    // Order book snapshot
    struct OrderBookSnapshot {
        std::string symbol;
        std::vector<BookLevel> bids;
        std::vector<BookLevel> asks;
        Price bestBid;
        Price bestAsk;
        Price spread;
        Price midPrice;
    };

    // Simulation metrics
    struct SimulationMetrics {
        uint64_t totalTicks;
        uint64_t totalTrades;
        uint64_t totalOrders;
        double avgSpread;
        double avgVolatility;
        std::map<std::string, double> returns;
        std::map<std::string, AgentTypeStats> agentTypeStats;  // keyed by agent type name
    };

    // Utility to get current timestamp
    inline Timestamp now() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }

} // namespace market
