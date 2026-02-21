#pragma once

#include "Agent.hpp"
#include <string>

namespace market {

    class SupplyDemandTrader : public Agent {
    public:
        SupplyDemandTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "SupplyDemandTrader"; }

    private:
        double threshold_;
        double noiseStd_;
    };

} // namespace market
