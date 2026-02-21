#pragma once

#include "Types.hpp"
#include <string>
#include <vector>
#include <map>

namespace market {

    class Commodity {
    public:
        Commodity(const std::string& symbol,
            const std::string& name,
            const std::string& category,
            Price initialPrice,
            double baseProduction = 100.0,
            double baseConsumption = 100.0,
            double volatility = 0.02,
            double initialInventory = 50.0);

        const std::string& getSymbol() const { return symbol_; }
        const std::string& getName() const { return name_; }
        const std::string& getCategory() const { return category_; }
        Price getPrice() const { return price_; }
        double getVolatility() const { return volatility_; }
        Volume getDailyVolume() const { return dailyVolume_; }
        const std::vector<Price>& getPriceHistory() const { return priceHistory_; }

        const SupplyDemand& getSupplyDemand() const { return supplyDemand_; }
        SupplyDemand& getMutableSupplyDemand() { return supplyDemand_; }

        double getSupplyDemandImbalance() const {
            return supplyDemand_.getImbalance();
        }

        void setPrice(Price price);
        void setVolatility(double v) { volatility_ = v; }
        void addVolume(Volume volume) { dailyVolume_ += volume; }
        void resetDailyVolume() { dailyVolume_ = 0; }

        void applyTradePrice(Price tradePrice, Volume tradeQty);

        void applySupplyShock(double magnitude);
        void applyDemandShock(double magnitude);

        void updateSupplyDemand(double tickScale);

        void setMaxDailyMove(double frac) { maxDailyMove_ = frac; }
        double getMaxDailyMove() const { return maxDailyMove_; }
        void markDayOpen() { dayOpenPrice_ = price_; }
        bool isCircuitBroken() const { return circuitBroken_; }
        void resetCircuitBreaker() { circuitBroken_ = false; }

        double getReturn(int periods = 1) const;
        double getVolatilityEstimate(int periods = 20) const;

        void setImpactDampening(double d) { impactDampening_ = d; }
        void setPriceFloor(double f) { priceFloor_ = f; }
        void setSupplyDecayRate(double d) { supplyDecayRate_ = d; }
        void setDemandDecayRate(double d) { demandDecayRate_ = d; }

    private:
        std::string symbol_;
        std::string name_;
        std::string category_;
        Price price_;
        double volatility_;
        Volume dailyVolume_;
        std::vector<Price> priceHistory_;
        static constexpr size_t MAX_HISTORY = 1000;

        SupplyDemand supplyDemand_;

        double baseProduction_;
        double baseConsumption_;

        double maxDailyMove_ = 0.15;
        Price dayOpenPrice_ = 0;
        bool circuitBroken_ = false;

        double impactDampening_ = 0.5;
        double priceFloor_ = 0.01;

        double supplyDecayRate_ = 0.1;
        double demandDecayRate_ = 0.1;
        double baseInventory_ = 50.0;
    };

} // namespace market
