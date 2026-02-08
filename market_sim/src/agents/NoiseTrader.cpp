#include "NoiseTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    NoiseTrader::NoiseTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double tpMin = cfg ? cfg->noise.tradeProbMin : 0.05;
        double tpRng = cfg ? cfg->noise.tradeProbRange : 0.10;
        double ssMin = cfg ? cfg->noise.sentSensitivityMin : 0.3;
        double ssMax = cfg ? cfg->noise.sentSensitivityMax : 0.8;

        tradeProbability_ = tpMin + Random::uniform(0, tpRng);
        sentimentSensitivity_ = Random::uniform(ssMin, ssMax);
    }

    void NoiseTrader::updateBeliefs(const NewsEvent& news) {
        double orMult = rtConfig_ ? rtConfig_->noise.overreactionMult : 1.0;
        double impact = news.magnitude * params_.newsWeight * sentimentSensitivity_ * orMult;

        switch (news.sentiment) {
        case NewsSentiment::POSITIVE:
            sentimentBias_ += impact;
            break;
        case NewsSentiment::NEGATIVE:
            sentimentBias_ -= impact;
            break;
        default:
            break;
        }
    }

    void NoiseTrader::decaySentiment(double tickScale) {
        double dg = rtConfig_ ? rtConfig_->noise.sentimentDecay : 0.98;
        double di = rtConfig_ ? rtConfig_->noise.industrySentDecay : 0.97;
        double ds = rtConfig_ ? rtConfig_->noise.symbolSentDecay : 0.95;

        sentimentBias_ *= std::pow(dg, tickScale);
        for (auto& [_, val] : industrySentiment_) val *= std::pow(di, tickScale);
        for (auto& [_, val] : symbolSentiment_)   val *= std::pow(ds, tickScale);
    }

    std::optional<Order> NoiseTrader::decide(const MarketState& state) {
        double mktProb = rtConfig_ ? rtConfig_->noise.marketOrderProb : 0.1;
        double loMin = rtConfig_ ? rtConfig_->noise.limitOffsetMin : 0.001;
        double loMax = rtConfig_ ? rtConfig_->noise.limitOffsetMax : 0.01;
        double cMin = rtConfig_ ? rtConfig_->noise.confidenceMin : 0.2;
        double cMax = rtConfig_ ? rtConfig_->noise.confidenceMax : 0.5;
        double bsW = rtConfig_ ? rtConfig_->noise.buyBiasSentWeight : 0.3;
        double bnStd = rtConfig_ ? rtConfig_->noise.buyBiasNoiseStd : 0.1;

        double effectiveProb = tradeProbability_ * (1.0 + std::abs(sentimentBias_)) * state.tickScale;

        if (Random::uniform(0, 1) > effectiveProb) {
            return std::nullopt;
        }

        if (state.prices.empty()) return std::nullopt;

        auto it = state.prices.begin();
        std::advance(it, Random::uniformInt(0, state.prices.size() - 1));
        std::string symbol = it->first;
        Price currentPrice = it->second;

        double buyProb = 0.5 + sentimentBias_ * bsW + Random::normal(0, bnStd);
        bool shouldBuy = Random::uniform(0, 1) < buyProb;

        if (shouldBuy) {
            double confidence = Random::uniform(cMin, cMax);
            Volume size = calculateOrderSize(currentPrice, confidence);

            if (size > 0 && canBuy(symbol, size, currentPrice)) {
                bool useMarket = Random::uniform(0, 1) < mktProb;
                OrderType type = useMarket ? OrderType::MARKET : OrderType::LIMIT;
                Price limitPrice = currentPrice * (1.0 + Random::uniform(loMin, loMax));
                return createOrder(symbol, OrderSide::BUY, type, limitPrice, size);
            }
        }
        else {
            Volume position = getPosition(symbol);
            if (position > 0) {
                double confidence = Random::uniform(cMin, cMax);
                Volume size = std::min(position, calculateOrderSize(currentPrice, confidence));

                if (size > 0) {
                    bool useMarket = Random::uniform(0, 1) < mktProb;
                    OrderType type = useMarket ? OrderType::MARKET : OrderType::LIMIT;
                    Price limitPrice = currentPrice * (1.0 - Random::uniform(loMin, loMax));
                    return createOrder(symbol, OrderSide::SELL, type, limitPrice, size);
                }
            }
        }

        return std::nullopt;
    }

} // namespace market
