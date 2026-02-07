#pragma once

#include <string>
#include <vector>
#include <algorithm>
#include "Types.hpp"

namespace market {

    class Asset {
    public:
        Asset(const std::string& symbol,
            const std::string& name,
            const std::string& industry,
            Price initialPrice,
            double volatility = 0.02,
            int64_t sharesOutstanding = 1000000,
            const std::string& description = "",
            const std::string& sectorDetail = "",
            const std::string& character = "mid_cap");

        // Getters
        const std::string& getSymbol() const { return symbol_; }
        const std::string& getName() const { return name_; }
        const std::string& getIndustry() const { return industry_; }
        const std::string& getDescription() const { return description_; }
        const std::string& getSectorDetail() const { return sectorDetail_; }
        const std::string& getCharacter() const { return character_; }
        Price getPrice() const { return price_; }
        Price getFundamentalValue() const { return fundamentalValue_; }
        double getVolatility() const { return volatility_; }
        double getLiquidity() const { return liquidity_; }
        int64_t getSharesOutstanding() const { return sharesOutstanding_; }
        const std::vector<Price>& getPriceHistory() const { return priceHistory_; }
        Volume getDailyVolume() const { return dailyVolume_; }
        double getMarketCap() const { return price_ * sharesOutstanding_; }

        // Setters
        void setPrice(Price price);
        void setFundamentalValue(Price value) { fundamentalValue_ = value; }
        void setVolatility(double v) { volatility_ = v; }
        void setSharesOutstanding(int64_t s) { sharesOutstanding_ = s; }
        void addVolume(Volume volume) { dailyVolume_ += volume; }
        void resetDailyVolume() { dailyVolume_ = 0; }

        // Price impact: blend trade price toward current price
        // alpha = 1.0 means full jump; lower = more dampening
        void applyTradePrice(Price tradePrice, Volume tradeQty);

        // Update fundamental value based on shocks
        // dailyGrowthRate is the per-DAY base growth; it will be applied as-is per call
        void updateFundamental(double globalShock,
            double industryShock,
            double companyShock,
            double dailyGrowthRate = 0.0);

        // Circuit breaker: max allowed price change per day (fraction, e.g. 0.15 = 15%)
        void setMaxDailyMove(double frac) { maxDailyMove_ = frac; }
        double getMaxDailyMove() const { return maxDailyMove_; }
        void markDayOpen() { dayOpenPrice_ = price_; }  // call at start of each day
        bool isCircuitBroken() const { return circuitBroken_; }
        void resetCircuitBreaker() { circuitBroken_ = false; }

        // Calculate returns
        double getReturn(int periods = 1) const;
        double getVolatilityEstimate(int periods = 20) const;

        // Get mispricing (fundamental - price)
        double getMispricing() const { return fundamentalValue_ - price_; }

    private:
        std::string symbol_;
        std::string name_;
        std::string industry_;
        std::string description_;
        std::string sectorDetail_;
        std::string character_;
        Price price_;
        Price fundamentalValue_;
        double volatility_;
        double liquidity_;
        int64_t sharesOutstanding_;
        Volume dailyVolume_;
        std::vector<Price> priceHistory_;
        static constexpr size_t MAX_HISTORY = 1000;

        // Circuit breaker state
        double maxDailyMove_ = 0.15;  // 15% max daily move
        Price dayOpenPrice_ = 0;
        bool circuitBroken_ = false;

        // Price impact dampening factor (1.0 = no dampening)
        double impactDampening_ = 0.5;  // blend 50% toward trade price

        // Fundamental shock clamp (max per-tick shock magnitude)
        double fundamentalShockClamp_ = 0.05;

        // Absolute price floor
        double priceFloor_ = 0.01;

    public:
        void setImpactDampening(double d) { impactDampening_ = d; }
        void setFundamentalShockClamp(double c) { fundamentalShockClamp_ = c; }
        void setPriceFloor(double f) { priceFloor_ = f; }
    };

} // namespace market
