#include "MomentumTrader.hpp"
#include "utils/Random.hpp"
#include <numeric>

namespace market {

    MomentumTrader::MomentumTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        int spMin = cfg ? cfg->momentum.shortPeriodMin : 3;
        int spRange = cfg ? cfg->momentum.shortPeriodRange : 4;
        int loMin = cfg ? cfg->momentum.longPeriodOffsetMin : 10;
        int loRange = cfg ? cfg->momentum.longPeriodOffsetRange : 15;

        shortPeriod_ = spMin + Random::uniformInt(0, spRange);
        longPeriod_ = shortPeriod_ + loMin + Random::uniformInt(0, loRange);
    }

    double MomentumTrader::calculateMA(const std::vector<Price>& history, int period) const {
        if (history.size() < static_cast<size_t>(period)) {
            return 0.0;
        }

        double sum = 0.0;
        auto start = history.end() - period;
        for (auto it = start; it != history.end(); ++it) {
            sum += *it;
        }
        return sum / period;
    }

    std::optional<Order> MomentumTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->momentum.reactionMult : 0.25;
        double loMin = rtConfig_ ? rtConfig_->momentum.limitOffsetMin : 0.0005;
        double loMax = rtConfig_ ? rtConfig_->momentum.limitOffsetMax : 0.005;
        double stRS = rtConfig_ ? rtConfig_->momentum.signalThresholdRiskScale : 0.001;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.priceHistory.empty()) return std::nullopt;

        auto it = state.priceHistory.begin();
        std::advance(it, Random::uniformInt(0, state.priceHistory.size() - 1));
        std::string symbol = it->first;

        const auto& history = it->second;
        if (history.size() < static_cast<size_t>(longPeriod_)) {
            return std::nullopt;
        }

        auto priceIt = state.prices.find(symbol);
        if (priceIt == state.prices.end()) return std::nullopt;
        Price currentPrice = priceIt->second;

        double shortMA = calculateMA(history, shortPeriod_);
        double longMA = calculateMA(history, longPeriod_);

        if (shortMA <= 0 || longMA <= 0) return std::nullopt;

        double signal = (shortMA - longMA) / longMA;

        double commoditySentiment = getCombinedSentiment(symbol);
        signal += commoditySentiment * 0.1 + sentimentBias_ * 0.05;

        double threshold = stRS * params_.riskAversion;

        if (signal > threshold) {
            double confidence = std::min(1.0, std::abs(signal) / 0.02);
            Volume size = calculateOrderSize(currentPrice, confidence);

            if (size > 0 && canBuy(symbol, size, currentPrice)) {
                Price limitPrice = currentPrice * (1.0 + Random::uniform(loMin, loMax));
                return createOrder(symbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
            }
        }
        else if (signal < -threshold) {
            Volume maxSellable = getMaxSellable(symbol);
            if (maxSellable > 0) {
                double confidence = std::min(1.0, std::abs(signal) / 0.02);
                Volume size = std::min(maxSellable, calculateOrderSize(currentPrice, confidence));

                if (size > 0) {
                    Price limitPrice = currentPrice * (1.0 - Random::uniform(loMin, loMax));
                    return createOrder(symbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
                }
            }
        }

        return std::nullopt;
    }

} // namespace market
