#pragma once

#include "Agent.hpp"
#include <string>
#include <deque>

namespace market {

    class EventTrader : public Agent {
    public:
        EventTrader(AgentId id, double cash, const AgentParams& params,
            const RuntimeConfig* cfg = nullptr);

        std::optional<Order> decide(const MarketState& state) override;
        std::string getType() const override { return "EventTrader"; }

    private:
        double reactionThreshold_;
        int cooldownTicks_;
        int ticksSinceLastTrade_;
        std::deque<NewsEvent> processedNews_;
    };

} // namespace market
