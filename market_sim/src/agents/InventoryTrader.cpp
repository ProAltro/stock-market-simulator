#include "InventoryTrader.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    InventoryTrader::InventoryTrader(AgentId id, double cash, const AgentParams& params,
        const RuntimeConfig* cfg)
        : Agent(id, cash, params, cfg)
    {
        double tirBase = cfg ? cfg->inventory.targetRatioBase : 0.1;
        double tirRange = cfg ? cfg->inventory.targetRatioRange : 0.05;
        double rbalBase = cfg ? cfg->inventory.rebalanceThresholdBase : 0.02;
        double rbalScale = cfg ? cfg->inventory.rebalanceThresholdRiskScale : 0.02;

        targetInventoryRatio_ = tirBase + Random::uniform(0, tirRange);
        rebalanceThreshold_ = rbalBase + rbalScale * params.riskAversion;
    }

    std::optional<Order> InventoryTrader::decide(const MarketState& state) {
        double rMult = rtConfig_ ? rtConfig_->inventory.reactionMult : 0.15;

        if (Random::uniform(0, 1) > params_.reactionSpeed * rMult * state.tickScale) {
            return std::nullopt;
        }

        if (state.prices.empty()) return std::nullopt;

        double totalValue = getTotalValue(state.prices);
        double targetInventoryValue = totalValue * targetInventoryRatio_;

        std::string bestSymbol;
        double bestDeviation = 0.0;
        OrderSide bestSide = OrderSide::BUY;

        for (const auto& [symbol, price] : state.prices) {
            Volume position = getPosition(symbol);
            double positionValue = position * price;
            double deviation = (positionValue - targetInventoryValue / state.prices.size()) / (totalValue > 0 ? totalValue : 1.0);

            if (std::abs(deviation) > std::abs(bestDeviation)) {
                bestDeviation = deviation;
                bestSymbol = symbol;
                bestSide = (deviation < 0) ? OrderSide::BUY : OrderSide::SELL;
            }
        }

        if (std::abs(bestDeviation) < rebalanceThreshold_) {
            return std::nullopt;
        }

        Price price = state.prices.at(bestSymbol);
        double confidence = std::min(1.0, std::abs(bestDeviation) / 0.1);
        Volume size = calculateOrderSize(price, confidence);

        if (bestSide == OrderSide::BUY) {
            if (size > 0 && canBuy(bestSymbol, size, price)) {
                Price limitPrice = price * (1.0 + Random::uniform(0, 0.002));
                return createOrder(bestSymbol, OrderSide::BUY, OrderType::LIMIT, limitPrice, size);
            }
        }
        else {
            Volume maxSellable = getMaxSellable(bestSymbol);
            size = std::min(size, maxSellable);
            if (size > 0) {
                Price limitPrice = price * (1.0 - Random::uniform(0, 0.002));
                return createOrder(bestSymbol, OrderSide::SELL, OrderType::LIMIT, limitPrice, size);
            }
        }

        return std::nullopt;
    }

} // namespace market
