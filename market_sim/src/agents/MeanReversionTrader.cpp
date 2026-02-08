#include "MeanReversionTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    MeanReversionTrader::MeanReversionTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        int lbMin = cfg ? cfg->meanReversion.lookbackMin : 20;
        int lbRange = cfg ? cfg->meanReversion.lookbackRange : 20;
        double zMin = cfg ? cfg->meanReversion.zThresholdMin : 1.5;
        double zRng = cfg ? cfg->meanReversion.zThresholdRange : 1.0;

        lookbackPeriod_ = lbMin + Random::uniformInt(0, lbRange);
        zThreshold_ = zMin + Random::uniform(0, zRng);
    }

    double MeanReversionTrader::calculateMean(const std::vector<Price>& history, int period) const {
        if (history.size() < static_cast<size_t>(period)) return 0.0;

        double sum = 0.0;
        auto start = history.end() - period;
        for (auto it = start; it != history.end(); ++it) {
            sum += *it;
        }
        return sum / period;
    }

    double MeanReversionTrader::calculateStd(const std::vector<Price>& history, int period, double mean) const {
        if (history.size() < static_cast<size_t>(period)) return 0.0;

        double sqSum = 0.0;
        auto start = history.end() - period;
        for (auto it = start; it != history.end(); ++it) {
            sqSum += (*it - mean) * (*it - mean);
        }
        return std::sqrt(sqSum / period);
    }

    std::optional<Order> MeanReversionTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->meanReversion.reactionMult : 0.2;
        double lpMax = rtConfig_ ? rtConfig_->meanReversion.limitPriceSpreadMax : 0.005;
        double ssW = rtConfig_ ? rtConfig_->meanReversion.sentSymbolWeight : 0.2;
        double sgW = rtConfig_ ? rtConfig_->meanReversion.sentGlobalWeight : 0.1;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.priceHistory.empty()) return std::nullopt;

        auto it = state.priceHistory.begin();
        std::advance(it, Random::uniformInt(0, state.priceHistory.size() - 1));
        std::string symbol = it->first;

        const auto& history = it->second;
        if (history.size() < static_cast<size_t>(lookbackPeriod_)) {
            return std::nullopt;
        }

        auto priceIt = state.prices.find(symbol);
        if (priceIt == state.prices.end()) return std::nullopt;
        Price currentPrice = priceIt->second;

        double mean = calculateMean(history, lookbackPeriod_);
        double std = calculateStd(history, lookbackPeriod_, mean);

        if (std <= 0) return std::nullopt;

        double zScore = (currentPrice - mean) / std;

        std::string industry;
        auto indIt = state.symbolToIndustry.find(symbol);
        if (indIt != state.symbolToIndustry.end()) industry = indIt->second;
        double symSent = 0.0;
        auto symSentIt = symbolSentiment_.find(symbol);
        if (symSentIt != symbolSentiment_.end()) symSent = symSentIt->second;
        zScore += (symSent * ssW + sentimentBias_ * sgW);

        if (zScore > zThreshold_) {
            Volume position = getPosition(symbol);
            if (position > 0) {
                double confidence = std::min(1.0, (std::abs(zScore) - zThreshold_) / 2.0);
                Volume size = std::min(position, calculateOrderSize(currentPrice, confidence));

                if (size > 0) {
                    Price limitPrice = currentPrice * (1.0 - Random::uniform(0, lpMax));
                    return createOrder(symbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
                }
            }
        }
        else if (zScore < -zThreshold_) {
            double confidence = std::min(1.0, (std::abs(zScore) - zThreshold_) / 2.0);
            Volume size = calculateOrderSize(currentPrice, confidence);

            if (size > 0 && canBuy(symbol, size, currentPrice)) {
                Price limitPrice = currentPrice * (1.0 + Random::uniform(0, lpMax));
                return createOrder(symbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
            }
        }

        return std::nullopt;
    }

} // namespace market
