#pragma once

#include "Agent.hpp"

namespace market {

    // Mean Reversion Trader: trades based on z-score deviation from rolling mean
    class MeanReversionTrader : public Agent {
    public:
        MeanReversionTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "MeanReversion"; }

    private:
        int lookbackPeriod_ = 30;
        double zThreshold_ = 2.0;  // Number of std deviations

        double calculateMean(const std::vector<Price>& history, int period) const;
        double calculateStd(const std::vector<Price>& history, int period, double mean) const;
    };

} // namespace market
