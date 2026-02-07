#include "MacroEnvironment.hpp"
#include "utils/Random.hpp"
#include <algorithm>
#include <cmath>

namespace market {

    MacroEnvironment::MacroEnvironment()
        : globalSentiment_(0.0)
        , interestRate_(0.05)
        , riskIndex_(0.3)
        , volatilityIndex_(0.2)
    {
    }

    void MacroEnvironment::update() {
        double sMean = rtConfig_ ? rtConfig_->macro.sentimentMean : sentimentMean_;
        double sRev = rtConfig_ ? rtConfig_->macro.sentimentReversion : sentimentReversion_;
        double sNoise = rtConfig_ ? rtConfig_->macro.sentimentNoiseStd : 0.01;
        double vMean = rtConfig_ ? rtConfig_->macro.volatilityMean : volatilityMean_;
        double vRev = rtConfig_ ? rtConfig_->macro.volatilityReversion : volatilityReversion_;
        double vNoise = rtConfig_ ? rtConfig_->macro.volatilityNoiseStd : 0.01;
        double irNoise = rtConfig_ ? rtConfig_->macro.interestRateNoiseStd : 0.0001;
        double irMin = rtConfig_ ? rtConfig_->macro.interestRateMin : 0.0;
        double irMax = rtConfig_ ? rtConfig_->macro.interestRateMax : 0.15;

        // Mean reversion for sentiment
        double sentimentDrift = sRev * (sMean - globalSentiment_);
        globalSentiment_ += sentimentDrift + Random::normal(0, sNoise);
        globalSentiment_ = std::clamp(globalSentiment_, -1.0, 1.0);

        // Mean reversion for volatility
        double volDrift = vRev * (vMean - volatilityIndex_);
        volatilityIndex_ += volDrift + Random::normal(0, vNoise);
        volatilityIndex_ = std::clamp(volatilityIndex_, 0.05, 1.0);

        // Risk index
        riskIndex_ = 0.3 + 0.3 * volatilityIndex_ - 0.2 * globalSentiment_;
        riskIndex_ = std::clamp(riskIndex_, 0.0, 1.0);

        // Interest rate slowly mean-reverts
        interestRate_ += Random::normal(0, irNoise);
        interestRate_ = std::clamp(interestRate_, irMin, irMax);
    }

    void MacroEnvironment::applyNews(const NewsEvent& news) {
        if (news.category != NewsCategory::GLOBAL && news.category != NewsCategory::POLITICAL) return;

        double polSentMult = rtConfig_ ? rtConfig_->macro.politicalSentimentMult : 0.3;
        double globSentMult = rtConfig_ ? rtConfig_->macro.globalSentimentMult : 0.5;
        double polVolImpact = rtConfig_ ? rtConfig_->macro.politicalVolImpact : 0.15;
        double negVolImpact = rtConfig_ ? rtConfig_->macro.negativeVolImpact : 0.1;

        double impact = news.magnitude;
        if (news.sentiment == NewsSentiment::NEGATIVE) {
            impact = -impact;
        }
        else if (news.sentiment == NewsSentiment::NEUTRAL) {
            impact *= 0.1;
        }

        double sentimentMult = (news.category == NewsCategory::POLITICAL) ? polSentMult : globSentMult;
        globalSentiment_ += impact * sentimentMult;
        globalSentiment_ = std::clamp(globalSentiment_, -1.0, 1.0);

        if (news.sentiment == NewsSentiment::NEGATIVE) {
            volatilityIndex_ += news.magnitude * negVolImpact;
        }
        if (news.category == NewsCategory::POLITICAL) {
            volatilityIndex_ += news.magnitude * polVolImpact;
        }
        volatilityIndex_ = std::clamp(volatilityIndex_, 0.05, 1.0);
    }

    double MacroEnvironment::getGlobalShock() const {
        double sw = rtConfig_ ? rtConfig_->macro.globalShockSentimentWeight : 0.0003;
        double ns = rtConfig_ ? rtConfig_->macro.globalShockNoiseStd : 0.0003;
        return globalSentiment_ * sw + Random::normal(0, ns);
    }

} // namespace market
