#include "EventTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>
#include <algorithm>

namespace market {

    EventTrader::EventTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double thrBase = cfg ? cfg->event.reactionThresholdBase : 0.03;
        double thrScale = cfg ? cfg->event.reactionThresholdRiskScale : 0.02;
        int cdBase = cfg ? cfg->event.cooldownBase : 10;
        int cdRange = cfg ? cfg->event.cooldownRange : 20;

        reactionThreshold_ = thrBase + thrScale * params.riskAversion;
        cooldownTicks_ = cdBase + Random::uniformInt(0, cdRange);
        ticksSinceLastTrade_ = cooldownTicks_;
    }

    std::optional<Order> EventTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->event.reactionMult : 0.5;

        ticksSinceLastTrade_++;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (ticksSinceLastTrade_ < cooldownTicks_) {
            return std::nullopt;
        }

        if (state.recentNews.empty() || state.prices.empty()) return std::nullopt;

        for (const auto& news : state.recentNews) {
            bool alreadyProcessed = std::any_of(processedNews_.begin(), processedNews_.end(),
                [&news](const NewsEvent& e) { return e.timestamp == news.timestamp && e.symbol == news.symbol; });

            if (alreadyProcessed) continue;

            processedNews_.push_back(news);
            if (processedNews_.size() > 20) {
                processedNews_.pop_front();
            }

            if (news.magnitude < reactionThreshold_) continue;

            std::string targetSymbol = news.symbol;
            if (targetSymbol.empty() && news.category == NewsCategory::GLOBAL) {
                auto it = state.prices.begin();
                std::advance(it, Random::uniformInt(0, state.prices.size() - 1));
                targetSymbol = it->first;
            }

            auto priceIt = state.prices.find(targetSymbol);
            if (priceIt == state.prices.end()) continue;

            Price price = priceIt->second;
            double confidence = std::min(1.0, news.magnitude / 0.1);

            bool isPositive = (news.sentiment == NewsSentiment::POSITIVE) ||
                (news.category == NewsCategory::DEMAND && news.sentiment != NewsSentiment::NEGATIVE) ||
                (news.category == NewsCategory::SUPPLY && news.sentiment == NewsSentiment::NEGATIVE);

            if (isPositive) {
                Volume size = calculateOrderSize(price, confidence);
                if (size > 0 && canBuy(targetSymbol, size, price)) {
                    ticksSinceLastTrade_ = 0;
                    return createOrder(targetSymbol, OrderSide::BUY, OrderType::MARKET, 0, size);
                }
            }
            else {
                Volume maxSellable = getMaxSellable(targetSymbol);
                Volume size = std::min(maxSellable, calculateOrderSize(price, confidence));
                if (size > 0) {
                    ticksSinceLastTrade_ = 0;
                    return createOrder(targetSymbol, OrderSide::SELL, OrderType::MARKET, 0, size);
                }
            }
        }

        return std::nullopt;
    }

} // namespace market
