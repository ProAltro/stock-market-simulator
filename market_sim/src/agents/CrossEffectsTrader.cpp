#include "CrossEffectsTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    CrossEffectsTrader::CrossEffectsTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        int lbMin = cfg ? cfg->crossEffects.lookbackMin : 5;
        int lbRange = cfg ? cfg->crossEffects.lookbackRange : 10;
        double thrBase = cfg ? cfg->crossEffects.thresholdBase : 0.02;
        double thrScale = cfg ? cfg->crossEffects.thresholdRiskScale : 0.02;

        lookbackPeriod_ = lbMin + Random::uniformInt(0, lbRange);
        threshold_ = thrBase + thrScale * params.riskAversion;
    }

    std::optional<Order> CrossEffectsTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->crossEffects.reactionMult : 0.2;
        double ceW = rtConfig_ ? rtConfig_->crossEffects.crossEffectWeight : 0.3;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.prices.empty() || state.crossEffects.empty()) return std::nullopt;

        for (const auto& [symbol, price] : state.prices) {
            lastPrices_[symbol] = price;
        }

        for (const auto& [sourceSymbol, effects] : state.crossEffects) {
            double sourceChange = detectPriceChange(sourceSymbol, state.prices.at(sourceSymbol));

            if (std::abs(sourceChange) > threshold_) {
                for (const auto& effect : effects) {
                    auto targetIt = state.prices.find(effect.targetSymbol);
                    if (targetIt == state.prices.end()) continue;

                    double expectedTargetChange = sourceChange * effect.coefficient * ceW;

                    if (expectedTargetChange > 0.01) {
                        double confidence = std::min(1.0, expectedTargetChange / 0.05);
                        Volume size = calculateOrderSize(targetIt->second, confidence);

                        if (size > 0 && canBuy(effect.targetSymbol, size, targetIt->second)) {
                            Price limitPrice = targetIt->second * (1.0 + Random::uniform(0, 0.003));
                            return createOrder(effect.targetSymbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
                        }
                    }
                    else if (expectedTargetChange < -0.01) {
                        Volume maxSellable = getMaxSellable(effect.targetSymbol);
                        if (maxSellable > 0) {
                            double confidence = std::min(1.0, std::abs(expectedTargetChange) / 0.05);
                            Volume size = std::min(maxSellable, calculateOrderSize(targetIt->second, confidence));

                            if (size > 0) {
                                Price limitPrice = targetIt->second * (1.0 - Random::uniform(0, 0.003));
                                return createOrder(effect.targetSymbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
                            }
                        }
                    }
                }
            }
        }

        return std::nullopt;
    }

    double CrossEffectsTrader::detectPriceChange(const std::string& symbol, Price currentPrice) {
        auto it = lastPrices_.find(symbol);
        if (it == lastPrices_.end() || it->second <= 0) {
            return 0.0;
        }

        return (currentPrice - it->second) / it->second;
    }

} // namespace market
