#include "Commodity.hpp"
#include "utils/Random.hpp"
#include <cmath>
#include <numeric>
#include <algorithm>

namespace market {

    Commodity::Commodity(const std::string& symbol,
        const std::string& name,
        const std::string& category,
        Price initialPrice,
        double baseProduction,
        double baseConsumption,
        double volatility,
        double initialInventory)
        : symbol_(symbol)
        , name_(name)
        , category_(category)
        , price_(initialPrice)
        , volatility_(volatility)
        , dailyVolume_(0)
        , baseProduction_(baseProduction)
        , baseConsumption_(baseConsumption)
    {
        priceHistory_.push_back(initialPrice);

        supplyDemand_.production = baseProduction;
        supplyDemand_.consumption = baseConsumption;
        supplyDemand_.inventory = initialInventory;
        supplyDemand_.imports = 0.0;
        supplyDemand_.exports = 0.0;
        baseInventory_ = initialInventory;
    }

    void Commodity::setPrice(Price price) {
        if (price <= 0) price = priceFloor_;

        if (dayOpenPrice_ > 0 && maxDailyMove_ > 0) {
            double moveFromOpen = (price - dayOpenPrice_) / dayOpenPrice_;
            if (std::abs(moveFromOpen) > maxDailyMove_) {
                circuitBroken_ = true;
                double sign = (moveFromOpen > 0) ? 1.0 : -1.0;
                price = dayOpenPrice_ * (1.0 + sign * maxDailyMove_);
            }
        }

        price_ = price;
        priceHistory_.push_back(price);

        if (priceHistory_.size() > MAX_HISTORY) {
            priceHistory_.erase(priceHistory_.begin());
        }
    }

    void Commodity::applyTradePrice(Price tradePrice, Volume tradeQty) {
        if (tradePrice <= 0) return;
        if (circuitBroken_) return;

        // Square-root volume scaling: large trades have diminishing per-trade
        // price impact (Kyle-lambda style).  A single-unit trade gets full
        // impactDampening_; a 100-unit trade gets 1/10 of it.  Capped at 0.5
        // so a single trade can never move price more than halfway to the fill.
        double alpha = std::min(0.5, impactDampening_ / std::max(1.0, std::sqrt(static_cast<double>(std::max(Volume(1), tradeQty)))));
        Price blended = price_ * (1.0 - alpha) + tradePrice * alpha;
        setPrice(blended);
    }

    void Commodity::applySupplyShock(double magnitude) {
        double shock = magnitude * baseProduction_;
        supplyDemand_.production = std::max(0.0, supplyDemand_.production + shock);

        if (magnitude < 0) {
            supplyDemand_.inventory = std::max(0.0, supplyDemand_.inventory + magnitude * supplyDemand_.inventory);
        }
    }

    void Commodity::applyDemandShock(double magnitude) {
        double shock = magnitude * baseConsumption_;
        supplyDemand_.consumption = std::max(0.0, supplyDemand_.consumption + shock);
    }

    void Commodity::updateSupplyDemand(double tickScale) {
        // 1. Mean-revert production/consumption toward base values
        double decaySupply = std::pow(supplyDecayRate_, tickScale);
        double decayDemand = std::pow(demandDecayRate_, tickScale);

        supplyDemand_.production = baseProduction_ * (1.0 - decaySupply) + supplyDemand_.production * decaySupply;
        supplyDemand_.consumption = baseConsumption_ * (1.0 - decayDemand) + supplyDemand_.consumption * decayDemand;

        // 2. Add random noise – use sqrt(tickScale) for correct diffusion scaling
        double sqrtTS = std::sqrt(tickScale);
        double randomSupplyNoise = Random::normal(0, 0.01 * baseProduction_ * sqrtTS);
        double randomDemandNoise = Random::normal(0, 0.01 * baseConsumption_ * sqrtTS);

        supplyDemand_.production = std::max(0.0, supplyDemand_.production + randomSupplyNoise);
        supplyDemand_.consumption = std::max(0.0, supplyDemand_.consumption + randomDemandNoise);

        // 3. Update inventory based on production/consumption flow
        double flowDelta = (supplyDemand_.production - supplyDemand_.consumption) * tickScale;
        supplyDemand_.inventory = std::max(0.0, supplyDemand_.inventory + flowDelta);
        // Mean-revert inventory toward base level
        double invDecay = std::pow(0.05, tickScale);
        supplyDemand_.inventory = baseInventory_ * (1.0 - invDecay) + supplyDemand_.inventory * invDecay;

        // NOTE: Price is NOT set here. Price emerges purely from trader orders
        // matching in the order book. Agents read getImbalance() to decide their
        // orders, and matched trades move the price via applyTradePrice().
    }

    double Commodity::getReturn(int periods) const {
        if (priceHistory_.size() < static_cast<size_t>(periods + 1)) {
            return 0.0;
        }

        size_t idx = priceHistory_.size() - periods - 1;
        double oldPrice = priceHistory_[idx];

        if (oldPrice <= 0) return 0.0;

        return (price_ - oldPrice) / oldPrice;
    }

    double Commodity::getVolatilityEstimate(int periods) const {
        if (priceHistory_.size() < static_cast<size_t>(periods + 1)) {
            return volatility_;
        }

        std::vector<double> returns;
        size_t start = priceHistory_.size() - periods - 1;

        for (size_t i = start; i < priceHistory_.size() - 1; ++i) {
            if (priceHistory_[i] > 0) {
                double ret = (priceHistory_[i + 1] - priceHistory_[i]) / priceHistory_[i];
                returns.push_back(ret);
            }
        }

        if (returns.empty()) return volatility_;

        double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
        double sq_sum = 0;
        for (double r : returns) {
            sq_sum += (r - mean) * (r - mean);
        }

        return std::sqrt(sq_sum / returns.size());
    }

} // namespace market
