#pragma once

#include "Agent.hpp"
#include <string>

namespace market {

    class InventoryTrader : public Agent {
    public:
        InventoryTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "InventoryTrader"; }

    private:
        double targetInventoryRatio_;
        double rebalanceThreshold_;
    };

} // namespace market
