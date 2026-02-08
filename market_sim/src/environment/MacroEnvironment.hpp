#pragma once

#include "core/Types.hpp"
#include "core/RuntimeConfig.hpp"

namespace market {

    // Macro environment state (global market conditions)
    class MacroEnvironment {
    public:
        MacroEnvironment();

        // RuntimeConfig injection
        void setRuntimeConfig(const RuntimeConfig* cfg) { rtConfig_ = cfg; }

        // Update macro variables (tickScale normalises per-tick rates)
        void update(double tickScale = 1.0);

        // Apply news impact
        void applyNews(const NewsEvent& news);

        // Getters
        double getGlobalSentiment() const { return globalSentiment_; }
        double getInterestRate() const { return interestRate_; }
        double getRiskIndex() const { return riskIndex_; }
        double getVolatilityIndex() const { return volatilityIndex_; }

        // Get shock values for fundamental updates (tickScale normalises noise)
        double getGlobalShock(double tickScale = 1.0) const;

        // Setters (for dashboard control)
        void setGlobalSentiment(double val) { globalSentiment_ = val; }
        void setInterestRate(double val) { interestRate_ = val; }
        void setRiskIndex(double val) { riskIndex_ = val; }

    private:
        const RuntimeConfig* rtConfig_ = nullptr;

        double globalSentiment_;      // -1 to 1
        double interestRate_;          // e.g., 0.05 = 5%
        double riskIndex_;            // 0 to 1 (0 = low risk, 1 = high risk)
        double volatilityIndex_;      // VIX-like measure

        // Mean reversion parameters (defaults; overridden by rtConfig_ if set)
        double sentimentMean_ = 0.0;
        double sentimentReversion_ = 0.05;
        double volatilityMean_ = 0.2;
        double volatilityReversion_ = 0.02;
    };

} // namespace market
