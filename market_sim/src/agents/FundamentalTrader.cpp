#include "FundamentalTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    FundamentalTrader::FundamentalTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double tBase = cfg ? cfg->fundamental.thresholdBase : 0.01;
        double tScale = cfg ? cfg->fundamental.thresholdRiskScale : 0.02;
        double nBase = cfg ? cfg->fundamental.noiseStdBase : 0.005;
        double nRange = cfg ? cfg->fundamental.noiseStdRange : 0.01;

        threshold_ = tBase + tScale * params.riskAversion;
        noiseStd_ = nBase + nRange * Random::uniform(0, 1);
    }

    std::optional<Order> FundamentalTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->fundamental.reactionMult : 0.3;
        double sImp = rtConfig_ ? rtConfig_->fundamental.sentimentImpact : 0.15;
        double lpMax = rtConfig_ ? rtConfig_->fundamental.limitPriceSpreadMax : 0.005;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.prices.empty()) return std::nullopt;

        auto it = state.prices.begin();
        std::advance(it, Random::uniformInt(0, state.prices.size() - 1));
        std::string symbol = it->first;

        Price currentPrice = state.prices.at(symbol);

        auto fundIt = state.fundamentals.find(symbol);
        if (fundIt == state.fundamentals.end()) return std::nullopt;

        Price estimatedFundamental = fundIt->second * (1.0 + Random::normal(0, noiseStd_));

        std::string industry;
        auto indIt = state.symbolToIndustry.find(symbol);
        if (indIt != state.symbolToIndustry.end()) industry = indIt->second;
        double sentiment = getCombinedSentiment(symbol, industry);
        estimatedFundamental *= (1.0 + sentiment * sImp);

        double mispricing = (estimatedFundamental - currentPrice) / currentPrice;

        if (mispricing > threshold_) {
            double confidence = std::min(1.0, std::abs(mispricing) / 0.1);
            Volume size = calculateOrderSize(currentPrice, confidence);

            if (size > 0 && canBuy(symbol, size, currentPrice)) {
                Price limitPrice = currentPrice * (1.0 + Random::uniform(0, lpMax));
                return createOrder(symbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
            }
        }
        else if (mispricing < -threshold_) {
            Volume position = getPosition(symbol);
            if (position > 0) {
                double confidence = std::min(1.0, std::abs(mispricing) / 0.1);
                Volume size = std::min(position, calculateOrderSize(currentPrice, confidence));

                if (size > 0) {
                    Price limitPrice = currentPrice * (1.0 - Random::uniform(0, lpMax));
                    return createOrder(symbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
                }
            }
        }

        return std::nullopt;
    }

} // namespace market
