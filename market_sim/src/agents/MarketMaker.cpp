#include "MarketMaker.hpp"
#include "utils/Random.hpp"
#include <cmath>
#include <algorithm>

namespace market {

    MarketMaker::MarketMaker(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double bsMin = cfg ? cfg->marketMaker.baseSpreadMin : 0.001;
        double bsMax = cfg ? cfg->marketMaker.baseSpreadMax : 0.003;
        double isMin = cfg ? cfg->marketMaker.inventorySkewMin : 0.0005;
        double isMax = cfg ? cfg->marketMaker.inventorySkewMax : 0.0015;
        int    miMin = cfg ? cfg->marketMaker.maxInventoryMin : 500;
        int    miMax = cfg ? cfg->marketMaker.maxInventoryMax : 1500;

        baseSpread_ = bsMin + Random::uniform(0, bsMax - bsMin);
        inventorySkew_ = isMin + Random::uniform(0, isMax - isMin);
        maxInventory_ = miMin + Random::uniformInt(0, miMax - miMin);
    }

    double MarketMaker::calculateSpread(const std::string& symbol, double volatility) const {
        double volMult = rtConfig_ ? rtConfig_->marketMaker.volatilitySpreadMult : 10.0;
        return baseSpread_ * (1.0 + volatility * volMult);
    }

    double MarketMaker::calculateSkew(const std::string& symbol) const {
        Volume inventory = getPosition(symbol);
        return inventory * inventorySkew_;
    }

    std::optional<Order> MarketMaker::decide(const MarketState& state) {
        if (state.tickScale < 1.0 && Random::uniform(0.0, 1.0) > state.tickScale) {
            return std::nullopt;
        }
        auto quotes = quoteMarket(state);
        if (!quotes.empty()) {
            return quotes[Random::uniformInt(0, quotes.size() - 1)];
        }
        return std::nullopt;
    }

    std::vector<Order> MarketMaker::quoteMarket(const MarketState& state) {
        std::vector<Order> orders;
        double sentSpreadMult = rtConfig_ ? rtConfig_->marketMaker.sentimentSpreadMult : 0.5;
        double qCapFrac = rtConfig_ ? rtConfig_->marketMaker.quoteCapitalFrac : 0.02;

        for (const auto& [symbol, price] : state.prices) {
            if (price <= 0) continue;

            double volatility = 0.02;
            auto histIt = state.priceHistory.find(symbol);
            if (histIt != state.priceHistory.end() && histIt->second.size() > 20) {
                const auto& history = histIt->second;
                double sumSq = 0;
                for (size_t i = history.size() - 20; i < history.size() - 1; ++i) {
                    if (history[i] > 0) {
                        double ret = (history[i + 1] - history[i]) / history[i];
                        sumSq += ret * ret;
                    }
                }
                volatility = std::sqrt(sumSq / 20);
            }

            double spread = calculateSpread(symbol, volatility);
            spread *= (1.0 + std::abs(sentimentBias_) * sentSpreadMult);

            double skew = calculateSkew(symbol);

            // midPrice = current price; supply-demand signal only widens spread
            // (informed traders like SupplyDemandTrader move price through their
            // directional orders, not through MM quote-shifting).
            double midPrice = price;

            auto sdIt = state.supplyDemand.find(symbol);
            if (sdIt != state.supplyDemand.end()) {
                double imbalance = sdIt->second.getImbalance();
                // Widen spread when supply/demand is unbalanced (more uncertainty)
                spread *= (1.0 + std::abs(imbalance) * 2.0);
            }

            double halfSpread = spread * midPrice / 2.0;

            double skewShift = skew * midPrice;
            // Cap skew to 25% of halfSpread so neither side collapses
            skewShift = std::clamp(skewShift, -halfSpread * 0.25, halfSpread * 0.25);

            double bidPrice = midPrice - halfSpread - skewShift;
            double askPrice = midPrice + halfSpread - skewShift;

            bidPrice = std::max(0.01, bidPrice);
            askPrice = std::max(bidPrice + 0.01, askPrice);

            Volume inventory = getPosition(symbol);

            Volume baseSize = static_cast<Volume>(cash_ * qCapFrac / price);
            baseSize = std::max(Volume(1), baseSize);

            if (inventory < maxInventory_ && canBuy(symbol, baseSize, bidPrice)) {
                orders.push_back(createOrder(symbol, OrderSide::BUY, OrderType::LIMIT, bidPrice, baseSize));
            }

            if (inventory > -maxInventory_) {
                Volume askSize = baseSize;
                orders.push_back(createOrder(symbol, OrderSide::SELL, OrderType::LIMIT, askPrice, askSize));
            }
        }

        return orders;
    }

} // namespace market
