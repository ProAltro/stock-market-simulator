#pragma once

#include "Agent.hpp"

namespace market {

    // Fundamental Trader: trades based on perceived fundamental value vs price
    class FundamentalTrader : public Agent {
    public:
        FundamentalTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "Fundamental"; }

    private:
        double threshold_ = 0.02;  // Mispricing threshold for action
        double noiseStd_ = 0.01;   // Noise in fundamental estimation
    };

} // namespace market
