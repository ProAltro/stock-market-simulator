#pragma once

#include <nlohmann/json.hpp>
#include <string>
#include <cstdint>

namespace market {

    struct RuntimeConfig {

        struct SimulationParams {
            int    tickRateMs = 50;
            int    maxTicks = 0;
            int    ticksPerDay = 72000;
            int    populateTicksPerDay = 576;
            int    populateFineTicksPerDay = 1440;
            int    populateFineDays = 7;
            std::string startDate = "2025-01-01";
        } simulation;

        struct CommodityParams {
            double circuitBreakerLimit = 0.15;
            double impactDampening = 0.5;
            double priceFloor = 0.01;
            double supplyDecayRate = 0.1;
            double demandDecayRate = 0.1;
        } commodity;

        struct OrderBookParams {
            uint64_t orderExpiryMs = 172800000;
        } orderBook;

        struct AgentCounts {
            int supplyDemand = 15;
            int momentum = 10;
            int meanReversion = 10;
            int noise = 8;
            int marketMaker = 5;
            int crossEffects = 8;
            int inventory = 6;
            int event = 6;
        } agentCounts;

        struct AgentCashParams {
            double meanCash = 100000.0;
            double stdCash = 30000.0;
        } agentCash;

        struct AgentGlobalParams {
            double capitalFraction = 0.05;
            double cashReserve = 0.10;
            int    maxOrderSize = 500;
            double sentimentDecayGlobal = 0.95;
            double sentimentDecayCommodity = 0.90;
            int    maxShortPosition = 20;
        } agentGlobal;

        struct AgentGeneration {
            double riskAversionMean = 1.0;
            double riskAversionStd = 0.3;
            double riskAversionMin = 0.1;
            double reactionSpeedLambda = 1.0;
            double newsWeightMin = 0.5;
            double newsWeightMax = 1.5;
            double confidenceMin = 0.3;
            double confidenceMax = 1.0;
            double timeHorizonMu = 3.0;
            double timeHorizonSigma = 0.5;
        } agentGen;

        struct MarketMakerParams {
            double baseSpreadMin = 0.001;
            double baseSpreadMax = 0.003;
            double inventorySkewMin = 0.0005;
            double inventorySkewMax = 0.0015;
            int    maxInventoryMin = 500;
            int    maxInventoryMax = 1500;
            int    initialInventoryPerCommodity = 100;
            double quoteCapitalFrac = 0.02;
            double sentimentSpreadMult = 0.5;
            double volatilitySpreadMult = 10.0;
        } marketMaker;

        struct SupplyDemandParams {
            double thresholdBase = 0.02;
            double thresholdRiskScale = 0.03;
            double noiseStdBase = 0.01;
            double noiseStdRange = 0.02;
            double sentimentImpact = 0.2;
            double reactionMult = 0.3;
            double limitPriceSpreadMax = 0.005;
        } supplyDemand;

        struct MomentumParams {
            int    shortPeriodMin = 3;
            int    shortPeriodRange = 4;
            int    longPeriodOffsetMin = 10;
            int    longPeriodOffsetRange = 15;
            double reactionMult = 0.25;
            double limitOffsetMin = 0.0005;
            double limitOffsetMax = 0.005;
            double signalThresholdRiskScale = 0.001;
        } momentum;

        struct MeanReversionParams {
            int    lookbackMin = 20;
            int    lookbackRange = 20;
            double zThresholdMin = 1.5;
            double zThresholdRange = 1.0;
            double reactionMult = 0.2;
            double limitPriceSpreadMax = 0.005;
        } meanReversion;

        struct NoiseParams {
            double tradeProbMin = 0.05;
            double tradeProbRange = 0.10;
            double sentSensitivityMin = 0.3;
            double sentSensitivityMax = 0.8;
            double overreactionMult = 1.0;
            double marketOrderProb = 0.1;
            double sentimentDecay = 0.98;
            double commoditySentDecay = 0.95;
            double limitOffsetMin = 0.001;
            double limitOffsetMax = 0.01;
            double confidenceMin = 0.2;
            double confidenceMax = 0.5;
            double buyBiasSentWeight = 0.3;
            double buyBiasNoiseStd = 0.1;
        } noise;

        struct CrossEffectsParams {
            int    lookbackMin = 5;
            int    lookbackRange = 10;
            double thresholdBase = 0.02;
            double thresholdRiskScale = 0.02;
            double reactionMult = 0.2;
            double crossEffectWeight = 0.3;
        } crossEffects;

        struct InventoryParams {
            double targetRatioBase = 0.1;
            double targetRatioRange = 0.05;
            double rebalanceThresholdBase = 0.02;
            double rebalanceThresholdRiskScale = 0.02;
            double reactionMult = 0.15;
        } inventory;

        struct EventParams {
            double reactionThresholdBase = 0.03;
            double reactionThresholdRiskScale = 0.02;
            int    cooldownBase = 10;
            int    cooldownRange = 20;
            double reactionMult = 0.5;
        } event;

        struct NewsParams {
            double lambda = 0.05;
            double globalImpactStd = 0.015;
            double politicalImpactStd = 0.02;
            double supplyImpactStd = 0.04;
            double demandImpactStd = 0.04;
        } news;

        nlohmann::json toJson() const {
            nlohmann::json j;

            j["simulation"] = {
                {"tickRateMs", simulation.tickRateMs},
                {"maxTicks", simulation.maxTicks},
                {"ticksPerDay", simulation.ticksPerDay},
                {"populateTicksPerDay", simulation.populateTicksPerDay},
                {"populateFineTicksPerDay", simulation.populateFineTicksPerDay},
                {"populateFineDays", simulation.populateFineDays},
                {"startDate", simulation.startDate}
            };

            j["commodity"] = {
                {"circuitBreakerLimit", commodity.circuitBreakerLimit},
                {"impactDampening", commodity.impactDampening},
                {"priceFloor", commodity.priceFloor},
                {"supplyDecayRate", commodity.supplyDecayRate},
                {"demandDecayRate", commodity.demandDecayRate}
            };

            j["agentCounts"] = {
                {"supplyDemand", agentCounts.supplyDemand},
                {"momentum", agentCounts.momentum},
                {"meanReversion", agentCounts.meanReversion},
                {"noise", agentCounts.noise},
                {"marketMaker", agentCounts.marketMaker},
                {"crossEffects", agentCounts.crossEffects},
                {"inventory", agentCounts.inventory},
                {"event", agentCounts.event}
            };

            j["agentCash"] = {
                {"meanCash", agentCash.meanCash},
                {"stdCash", agentCash.stdCash}
            };

            j["supplyDemand"] = {
                {"thresholdBase", supplyDemand.thresholdBase},
                {"thresholdRiskScale", supplyDemand.thresholdRiskScale},
                {"noiseStdBase", supplyDemand.noiseStdBase},
                {"noiseStdRange", supplyDemand.noiseStdRange},
                {"sentimentImpact", supplyDemand.sentimentImpact},
                {"reactionMult", supplyDemand.reactionMult},
                {"limitPriceSpreadMax", supplyDemand.limitPriceSpreadMax}
            };

            j["crossEffects"] = {
                {"lookbackMin", crossEffects.lookbackMin},
                {"lookbackRange", crossEffects.lookbackRange},
                {"thresholdBase", crossEffects.thresholdBase},
                {"thresholdRiskScale", crossEffects.thresholdRiskScale},
                {"reactionMult", crossEffects.reactionMult},
                {"crossEffectWeight", crossEffects.crossEffectWeight}
            };

            j["inventory"] = {
                {"targetRatioBase", inventory.targetRatioBase},
                {"targetRatioRange", inventory.targetRatioRange},
                {"rebalanceThresholdBase", inventory.rebalanceThresholdBase},
                {"rebalanceThresholdRiskScale", inventory.rebalanceThresholdRiskScale},
                {"reactionMult", inventory.reactionMult}
            };

            j["event"] = {
                {"reactionThresholdBase", event.reactionThresholdBase},
                {"reactionThresholdRiskScale", event.reactionThresholdRiskScale},
                {"cooldownBase", event.cooldownBase},
                {"cooldownRange", event.cooldownRange},
                {"reactionMult", event.reactionMult}
            };

            j["news"] = {
                {"lambda", news.lambda},
                {"globalImpactStd", news.globalImpactStd},
                {"politicalImpactStd", news.politicalImpactStd},
                {"supplyImpactStd", news.supplyImpactStd},
                {"demandImpactStd", news.demandImpactStd}
            };

            return j;
        }

        void fromJson(const nlohmann::json& j) {
            auto get = [](const nlohmann::json& obj, const char* key, auto& dst) {
                if (obj.contains(key)) dst = obj[key].get<std::remove_reference_t<decltype(dst)>>();
                };

            if (j.contains("simulation")) {
                auto& s = j["simulation"];
                get(s, "tickRateMs", simulation.tickRateMs);
                get(s, "maxTicks", simulation.maxTicks);
                get(s, "ticksPerDay", simulation.ticksPerDay);
                get(s, "populateTicksPerDay", simulation.populateTicksPerDay);
                get(s, "populateFineTicksPerDay", simulation.populateFineTicksPerDay);
                get(s, "populateFineDays", simulation.populateFineDays);
                get(s, "startDate", simulation.startDate);
            }

            if (j.contains("commodity")) {
                auto& c = j["commodity"];
                get(c, "circuitBreakerLimit", commodity.circuitBreakerLimit);
                get(c, "impactDampening", commodity.impactDampening);
                get(c, "priceFloor", commodity.priceFloor);
                get(c, "supplyDecayRate", commodity.supplyDecayRate);
                get(c, "demandDecayRate", commodity.demandDecayRate);
            }

            if (j.contains("orderBook")) {
                auto& o = j["orderBook"];
                get(o, "orderExpiryMs", orderBook.orderExpiryMs);
            }

            // Accept both "agents" and "agentCounts" keys
            auto parseAgentCounts = [&](const nlohmann::json& a) {
                get(a, "supplyDemand", agentCounts.supplyDemand);
                get(a, "momentum", agentCounts.momentum);
                get(a, "meanReversion", agentCounts.meanReversion);
                get(a, "noise", agentCounts.noise);
                get(a, "marketMaker", agentCounts.marketMaker);
                get(a, "crossEffects", agentCounts.crossEffects);
                get(a, "inventory", agentCounts.inventory);
                get(a, "event", agentCounts.event);
                };
            if (j.contains("agentCounts")) parseAgentCounts(j["agentCounts"]);
            if (j.contains("agents")) parseAgentCounts(j["agents"]);

            if (j.contains("agentCash")) {
                auto& c = j["agentCash"];
                get(c, "meanCash", agentCash.meanCash);
                get(c, "stdCash", agentCash.stdCash);
            }

            if (j.contains("agentGlobal")) {
                auto& g = j["agentGlobal"];
                get(g, "capitalFraction", agentGlobal.capitalFraction);
                get(g, "cashReserve", agentGlobal.cashReserve);
                get(g, "maxOrderSize", agentGlobal.maxOrderSize);
                get(g, "sentimentDecayGlobal", agentGlobal.sentimentDecayGlobal);
                get(g, "sentimentDecayCommodity", agentGlobal.sentimentDecayCommodity);
                get(g, "maxShortPosition", agentGlobal.maxShortPosition);
            }

            if (j.contains("marketMaker")) {
                auto& m = j["marketMaker"];
                get(m, "baseSpreadMin", marketMaker.baseSpreadMin);
                get(m, "baseSpreadMax", marketMaker.baseSpreadMax);
                get(m, "inventorySkewMin", marketMaker.inventorySkewMin);
                get(m, "inventorySkewMax", marketMaker.inventorySkewMax);
                get(m, "maxInventoryMin", marketMaker.maxInventoryMin);
                get(m, "maxInventoryMax", marketMaker.maxInventoryMax);
                get(m, "initialInventoryPerCommodity", marketMaker.initialInventoryPerCommodity);
                get(m, "quoteCapitalFrac", marketMaker.quoteCapitalFrac);
                get(m, "sentimentSpreadMult", marketMaker.sentimentSpreadMult);
                get(m, "volatilitySpreadMult", marketMaker.volatilitySpreadMult);
            }

            if (j.contains("supplyDemand")) {
                auto& sd = j["supplyDemand"];
                get(sd, "thresholdBase", supplyDemand.thresholdBase);
                get(sd, "thresholdRiskScale", supplyDemand.thresholdRiskScale);
                get(sd, "noiseStdBase", supplyDemand.noiseStdBase);
                get(sd, "noiseStdRange", supplyDemand.noiseStdRange);
                get(sd, "sentimentImpact", supplyDemand.sentimentImpact);
                get(sd, "reactionMult", supplyDemand.reactionMult);
                get(sd, "limitPriceSpreadMax", supplyDemand.limitPriceSpreadMax);
            }

            if (j.contains("momentum")) {
                auto& mo = j["momentum"];
                get(mo, "shortPeriodMin", momentum.shortPeriodMin);
                get(mo, "shortPeriodRange", momentum.shortPeriodRange);
                get(mo, "longPeriodOffsetMin", momentum.longPeriodOffsetMin);
                get(mo, "longPeriodOffsetRange", momentum.longPeriodOffsetRange);
                get(mo, "reactionMult", momentum.reactionMult);
                get(mo, "limitOffsetMin", momentum.limitOffsetMin);
                get(mo, "limitOffsetMax", momentum.limitOffsetMax);
                get(mo, "signalThresholdRiskScale", momentum.signalThresholdRiskScale);
            }

            if (j.contains("meanReversion")) {
                auto& mr = j["meanReversion"];
                get(mr, "lookbackMin", meanReversion.lookbackMin);
                get(mr, "lookbackRange", meanReversion.lookbackRange);
                get(mr, "zThresholdMin", meanReversion.zThresholdMin);
                get(mr, "zThresholdRange", meanReversion.zThresholdRange);
                get(mr, "reactionMult", meanReversion.reactionMult);
                get(mr, "limitPriceSpreadMax", meanReversion.limitPriceSpreadMax);
            }

            if (j.contains("noise")) {
                auto& no = j["noise"];
                get(no, "tradeProbMin", noise.tradeProbMin);
                get(no, "tradeProbRange", noise.tradeProbRange);
                get(no, "sentSensitivityMin", noise.sentSensitivityMin);
                get(no, "sentSensitivityMax", noise.sentSensitivityMax);
                get(no, "overreactionMult", noise.overreactionMult);
                get(no, "marketOrderProb", noise.marketOrderProb);
                get(no, "limitOffsetMin", noise.limitOffsetMin);
                get(no, "limitOffsetMax", noise.limitOffsetMax);
                get(no, "buyBiasSentWeight", noise.buyBiasSentWeight);
                get(no, "buyBiasNoiseStd", noise.buyBiasNoiseStd);
            }

            if (j.contains("crossEffects")) {
                auto& ce = j["crossEffects"];
                get(ce, "lookbackMin", crossEffects.lookbackMin);
                get(ce, "lookbackRange", crossEffects.lookbackRange);
                get(ce, "thresholdBase", crossEffects.thresholdBase);
                get(ce, "thresholdRiskScale", crossEffects.thresholdRiskScale);
                get(ce, "reactionMult", crossEffects.reactionMult);
                get(ce, "crossEffectWeight", crossEffects.crossEffectWeight);
            }

            if (j.contains("inventory")) {
                auto& iv = j["inventory"];
                get(iv, "targetRatioBase", inventory.targetRatioBase);
                get(iv, "targetRatioRange", inventory.targetRatioRange);
                get(iv, "rebalanceThresholdBase", inventory.rebalanceThresholdBase);
                get(iv, "rebalanceThresholdRiskScale", inventory.rebalanceThresholdRiskScale);
                get(iv, "reactionMult", inventory.reactionMult);
            }

            if (j.contains("event")) {
                auto& ev = j["event"];
                get(ev, "reactionThresholdBase", event.reactionThresholdBase);
                get(ev, "reactionThresholdRiskScale", event.reactionThresholdRiskScale);
                get(ev, "cooldownBase", event.cooldownBase);
                get(ev, "cooldownRange", event.cooldownRange);
                get(ev, "reactionMult", event.reactionMult);
            }

            if (j.contains("news")) {
                auto& n = j["news"];
                get(n, "lambda", news.lambda);
                get(n, "globalImpactStd", news.globalImpactStd);
                get(n, "politicalImpactStd", news.politicalImpactStd);
                get(n, "supplyImpactStd", news.supplyImpactStd);
                get(n, "demandImpactStd", news.demandImpactStd);
            }
        }

        void fromLegacyJson(const nlohmann::json& cfg) {
            fromJson(cfg);
        }
    };

} // namespace market
