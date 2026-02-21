#include "SupplyDemandTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    SupplyDemandTrader::SupplyDemandTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double tBase = cfg ? cfg->supplyDemand.thresholdBase : 0.02;
        double tScale = cfg ? cfg->supplyDemand.thresholdRiskScale : 0.03;
        double nBase = cfg ? cfg->supplyDemand.noiseStdBase : 0.01;
        double nRange = cfg ? cfg->supplyDemand.noiseStdRange : 0.02;

        threshold_ = tBase + tScale * params.riskAversion;
        noiseStd_ = nBase + nRange * Random::uniform(0, 1);
    }

    std::optional<Order> SupplyDemandTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->supplyDemand.reactionMult : 0.3;
        double sImp = rtConfig_ ? rtConfig_->supplyDemand.sentimentImpact : 0.2;
        double lpMax = rtConfig_ ? rtConfig_->supplyDemand.limitPriceSpreadMax : 0.005;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.prices.empty() || state.supplyDemand.empty()) return std::nullopt;

        auto it = state.prices.begin();
        std::advance(it, Random::uniformInt(0, state.prices.size() - 1));
        std::string symbol = it->first;

        Price currentPrice = state.prices.at(symbol);

        auto sdIt = state.supplyDemand.find(symbol);
        if (sdIt == state.supplyDemand.end()) return std::nullopt;

        double imbalance = sdIt->second.getImbalance();
        double estimatedImbalance = imbalance + Random::normal(0, noiseStd_);

        double sentiment = getCombinedSentiment(symbol);
        estimatedImbalance += sentiment * sImp;

        if (estimatedImbalance > threshold_) {
            double confidence = std::min(1.0, std::abs(estimatedImbalance) / 0.15);
            Volume size = calculateOrderSize(currentPrice, confidence);

            if (size > 0 && canBuy(symbol, size, currentPrice)) {
                Price limitPrice = currentPrice * (1.0 + Random::uniform(0, lpMax));
                return createOrder(symbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
            }
        }
        else if (estimatedImbalance < -threshold_) {
            Volume maxSellable = getMaxSellable(symbol);
            if (maxSellable > 0) {
                double confidence = std::min(1.0, std::abs(estimatedImbalance) / 0.15);
                Volume size = std::min(maxSellable, calculateOrderSize(currentPrice, confidence));

                if (size > 0) {
                    Price limitPrice = currentPrice * (1.0 - Random::uniform(0, lpMax));
                    return createOrder(symbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
                }
            }
        }

        return std::nullopt;
    }

} // namespace market
