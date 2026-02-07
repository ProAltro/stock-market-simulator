#pragma once

#include "Agent.hpp"
#include <vector>

namespace market {

    // Market Maker: continuously quotes bid/ask, manages inventory risk
    class MarketMaker : public Agent {
    public:
        MarketMaker(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::vector<Order> quoteMarket(const MarketState& state);
        std::string getType() const override { return "MarketMaker"; }

    private:
        double baseSpread_ = 0.002;  // 0.2% base spread
        double inventorySkew_ = 0.001;  // Skew per unit of inventory
        int maxInventory_ = 1000;

        // Track quotes for each symbol
        std::map<std::string, std::pair<OrderId, OrderId>> activeQuotes_;  // bid, ask order ids

        double calculateSpread(const std::string& symbol, double volatility) const;
        double calculateSkew(const std::string& symbol) const;
    };

} // namespace market
