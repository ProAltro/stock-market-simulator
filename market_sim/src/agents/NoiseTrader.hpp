#pragma once

#include "Agent.hpp"

namespace market {

    // Noise Trader: trades randomly with sentiment influence
    class NoiseTrader : public Agent {
    public:
        NoiseTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        void updateBeliefs(const NewsEvent& news) override;
        void decaySentiment() override;
        std::string getType() const override { return "Noise"; }

    private:
        double tradeProbability_ = 0.1;
        double sentimentSensitivity_ = 0.5;
    };

} // namespace market
