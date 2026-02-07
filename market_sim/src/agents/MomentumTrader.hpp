#pragma once

#include "Agent.hpp"

namespace market {

    // Momentum Trader: trades based on moving average crossovers
    class MomentumTrader : public Agent {
    public:
        MomentumTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "Momentum"; }

    private:
        int shortPeriod_ = 5;
        int longPeriod_ = 20;

        double calculateMA(const std::vector<Price>& history, int period) const;
    };

} // namespace market
