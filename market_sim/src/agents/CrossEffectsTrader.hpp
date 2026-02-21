#pragma once

#include "Agent.hpp"
#include <string>
#include <map>

namespace market {

    class CrossEffectsTrader : public Agent {
    public:
        CrossEffectsTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "CrossEffectsTrader"; }

    private:
        int lookbackPeriod_;
        double threshold_;
        std::map<std::string, double> lastPrices_;

        double detectPriceChange(const std::string& symbol, Price currentPrice);
    };

} // namespace market
