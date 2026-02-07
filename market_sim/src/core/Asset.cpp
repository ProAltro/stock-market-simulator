#include "Asset.hpp"
#include <cmath>
#include <numeric>
#include <algorithm>

namespace market {

    Asset::Asset(const std::string& symbol,
        const std::string& name,
        const std::string& industry,
        Price initialPrice,
        double volatility,
        int64_t sharesOutstanding,
        const std::string& description,
        const std::string& sectorDetail,
        const std::string& character)
        : symbol_(symbol)
        , name_(name)
        , industry_(industry)
        , description_(description)
        , sectorDetail_(sectorDetail)
        , character_(character)
        , price_(initialPrice)
        , fundamentalValue_(initialPrice)
        , volatility_(volatility)
        , liquidity_(1.0)
        , sharesOutstanding_(sharesOutstanding)
        , dailyVolume_(0)
    {
        priceHistory_.push_back(initialPrice);
    }

    void Asset::setPrice(Price price) {
        if (price <= 0) price = priceFloor_;  // absolute floor

        // Circuit breaker: clamp to maxDailyMove from day open
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

        // Keep history bounded
        if (priceHistory_.size() > MAX_HISTORY) {
            priceHistory_.erase(priceHistory_.begin());
        }

        // Update liquidity based on recent volume
        liquidity_ = std::min(2.0, std::max(0.1,
            static_cast<double>(dailyVolume_) / (sharesOutstanding_ * 0.01)));
    }

    void Asset::applyTradePrice(Price tradePrice, Volume tradeQty) {
        if (tradePrice <= 0) return;
        if (circuitBroken_) return;  // trading halted

        // Simple dampening: blend trade price toward current price
        // This prevents a single small trade from fully setting the price
        double alpha = impactDampening_;  // default 0.5
        Price blended = price_ * (1.0 - alpha) + tradePrice * alpha;
        setPrice(blended);
    }

    void Asset::updateFundamental(double globalShock,
        double industryShock,
        double companyShock,
        double dailyGrowthRate) {
        // dailyGrowthRate is already the correct per-call rate (caller scales it)
        double totalShock = dailyGrowthRate + globalShock + industryShock + companyShock;

        // Clamp totalShock to prevent extreme jumps
        totalShock = std::clamp(totalShock, -fundamentalShockClamp_, fundamentalShockClamp_);

        fundamentalValue_ *= std::exp(totalShock);

        // Clamp to reasonable bounds relative to initial
        fundamentalValue_ = std::max(priceFloor_, fundamentalValue_);
    }

    double Asset::getReturn(int periods) const {
        if (priceHistory_.size() < static_cast<size_t>(periods + 1)) {
            return 0.0;
        }

        size_t idx = priceHistory_.size() - periods - 1;
        double oldPrice = priceHistory_[idx];

        if (oldPrice <= 0) return 0.0;

        return (price_ - oldPrice) / oldPrice;
    }

    double Asset::getVolatilityEstimate(int periods) const {
        if (priceHistory_.size() < static_cast<size_t>(periods + 1)) {
            return volatility_;
        }

        // Calculate returns
        std::vector<double> returns;
        size_t start = priceHistory_.size() - periods - 1;

        for (size_t i = start; i < priceHistory_.size() - 1; ++i) {
            if (priceHistory_[i] > 0) {
                double ret = (priceHistory_[i + 1] - priceHistory_[i]) / priceHistory_[i];
                returns.push_back(ret);
            }
        }

        if (returns.empty()) return volatility_;

        // Calculate standard deviation
        double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / returns.size();
        double sq_sum = 0;
        for (double r : returns) {
            sq_sum += (r - mean) * (r - mean);
        }

        return std::sqrt(sq_sum / returns.size());
    }

} // namespace market
