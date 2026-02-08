#pragma once

#include <nlohmann/json.hpp>
#include <string>
#include <cstdint>

namespace market {

    /// Central, JSON-serialisable configuration for every tunable knob in the
    /// simulation.  Every sub-struct carries sensible defaults so the sim works
    /// out-of-the-box.  All values can be patched at runtime via the REST API
    /// (POST /config) and re-read on the next tick – no rebuild required.

    struct RuntimeConfig {

        // ---- Simulation lifecycle ------------------------------------------------
        struct SimulationParams {
            int    tickRateMs = 50;
            int    maxTicks = 0;       // 0 = unlimited
            int    ticksPerDay = 72000;
            int    populateTicksPerDay = 576;       // ~2.5 min granularity
            int    populateFineTicksPerDay = 1440;  // 1 min granularity for last N days
            int    populateFineDays = 7;            // How many days use fine tick rate
            std::string startDate = "2025-08-07";
        } simulation;

        // ---- Fundamental / price-evolution engine --------------------------------
        struct EngineParams {
            double annualGrowthRate = 0.08;
            double companyShockStd = 0.0002;
            double newsToFundamentalScale = 0.005;
            double industryShockScale = 0.005;   // NEW – scale the accumulated industry shock
            double industryShockDecay = 0.95;
            double companyShockDecay = 0.90;
        } engine;

        // ---- Macro environment ---------------------------------------------------
        struct MacroParams {
            double sentimentMean = 0.0;
            double sentimentReversion = 0.05;
            double sentimentNoiseStd = 0.01;
            double volatilityMean = 0.2;
            double volatilityReversion = 0.02;
            double volatilityNoiseStd = 0.01;
            double initialInterestRate = 0.05;
            double interestRateNoiseStd = 0.0001;
            double interestRateMin = 0.0;
            double interestRateMax = 0.15;
            double globalShockSentimentWeight = 0.0003;
            double globalShockNoiseStd = 0.0003;
            double politicalSentimentMult = 0.3;
            double globalSentimentMult = 0.5;
            double politicalVolImpact = 0.15;
            double negativeVolImpact = 0.1;
        } macro;

        // ---- Per-asset price mechanics -------------------------------------------
        struct AssetParams {
            double circuitBreakerLimit = 0.15;   // 15 % max daily move
            double impactDampening = 0.5;    // blend factor in applyTradePrice
            double fundamentalShockClamp = 0.05;   // max single-tick fundamental change
            double priceFloor = 0.01;
        } asset;

        // ---- Order book ----------------------------------------------------------
        struct OrderBookParams {
            uint64_t orderExpiryMs = 172800000;      // 2 simulated days
        } orderBook;

        // ---- Agent counts --------------------------------------------------------
        struct AgentCounts {
            int fundamental = 60;
            int momentum = 40;
            int meanReversion = 20;
            int noise = 25;
            int marketMaker = 25;
        } agentCounts;

        // ---- Agent cash distribution ---------------------------------------------
        struct AgentCashParams {
            double meanCash = 100000.0;
            double stdCash = 20000.0;
        } agentCash;

        // ---- Agent-global sizing & risk ------------------------------------------
        struct AgentGlobalParams {
            double capitalFraction = 0.05;
            double cashReserve = 0.10;
            int    maxOrderSize = 500;
            // Sentiment decay rates (per-tick multiplier)
            double sentimentDecayGlobal = 0.95;
            double sentimentDecayIndustry = 0.93;
            double sentimentDecaySymbol = 0.90;
        } agentGlobal;

        // ---- Agent parameter distributions (for AgentFactory::generateParams) ----
        struct AgentGeneration {
            double riskAversionMean = 1.0;
            double riskAversionStd = 0.3;
            double riskAversionMin = 0.1;
            double reactionSpeedLambda = 1.0;   // exponential distribution lambda
            double newsWeightMin = 0.5;
            double newsWeightMax = 1.5;
            double confidenceMin = 0.3;
            double confidenceMax = 1.0;
            double timeHorizonMu = 3.0;     // log-normal μ
            double timeHorizonSigma = 0.5;     // log-normal σ
        } agentGen;

        // ---- Market Maker --------------------------------------------------------
        struct MarketMakerParams {
            double baseSpreadMin = 0.001;
            double baseSpreadMax = 0.003;
            double inventorySkewMin = 0.0005;
            double inventorySkewMax = 0.0015;
            int    maxInventoryMin = 500;
            int    maxInventoryMax = 1500;
            int    initialInventoryPerStock = 100;   // NEW – seed inventory at init
            double quoteCapitalFrac = 0.02;
            double sentimentSpreadMult = 0.5;
            double volatilitySpreadMult = 10.0;
            double fundamentalWeight = 0.05;  // blend mid toward fundamental (informed MM)
        } marketMaker;

        // ---- Fundamental Trader --------------------------------------------------
        struct FundamentalParams {
            double thresholdBase = 0.01;
            double thresholdRiskScale = 0.02;
            double noiseStdBase = 0.005;
            double noiseStdRange = 0.01;
            double sentimentImpact = 0.15;
            double reactionMult = 0.3;
            double limitPriceSpreadMax = 0.005;
        } fundamental;

        // ---- Momentum Trader -----------------------------------------------------
        struct MomentumParams {
            int    shortPeriodMin = 3;
            int    shortPeriodRange = 4;       // short = min + uniformInt(0, range)
            int    longPeriodOffsetMin = 10;
            int    longPeriodOffsetRange = 15;
            double reactionMult = 0.25;
            double limitOffsetMin = 0.0005;
            double limitOffsetMax = 0.005;
            double signalThresholdRiskScale = 0.001;
            double industrySentWeight = 0.1;
            double globalSentWeight = 0.05;
        } momentum;

        // ---- Mean-Reversion Trader -----------------------------------------------
        struct MeanReversionParams {
            int    lookbackMin = 20;
            int    lookbackRange = 20;
            double zThresholdMin = 1.5;
            double zThresholdRange = 1.0;
            double reactionMult = 0.2;
            double limitPriceSpreadMax = 0.005;
            double sentSymbolWeight = 0.2;
            double sentGlobalWeight = 0.1;
        } meanReversion;

        // ---- Noise Trader --------------------------------------------------------
        struct NoiseParams {
            double tradeProbMin = 0.05;
            double tradeProbRange = 0.10;
            double sentSensitivityMin = 0.3;
            double sentSensitivityMax = 0.8;
            double overreactionMult = 1.0;
            double marketOrderProb = 0.1;
            double sentimentDecay = 0.98;
            double industrySentDecay = 0.97;
            double symbolSentDecay = 0.95;
            double limitOffsetMin = 0.001;
            double limitOffsetMax = 0.01;
            double confidenceMin = 0.2;
            double confidenceMax = 0.5;
            double buyBiasSentWeight = 0.3;
            double buyBiasNoiseStd = 0.1;
        } noise;

        // ---- News Generator ------------------------------------------------------
        struct NewsParams {
            double lambda = 0.12;
            double globalImpactStd = 0.02;
            double politicalImpactStd = 0.04;
            double industryImpactStd = 0.03;
            double companyImpactStd = 0.03;
        } news;

        // ==== JSON serialisation ==================================================

        nlohmann::json toJson() const {
            nlohmann::json j;

            j["simulation"] = {
                {"tickRateMs",              simulation.tickRateMs},
                {"maxTicks",                simulation.maxTicks},
                {"ticksPerDay",             simulation.ticksPerDay},
                {"populateTicksPerDay",     simulation.populateTicksPerDay},
                {"populateFineTicksPerDay", simulation.populateFineTicksPerDay},
                {"populateFineDays",        simulation.populateFineDays},
                {"startDate",               simulation.startDate}
            };

            j["engine"] = {
                {"annualGrowthRate",       engine.annualGrowthRate},
                {"companyShockStd",        engine.companyShockStd},
                {"newsToFundamentalScale", engine.newsToFundamentalScale},
                {"industryShockScale",     engine.industryShockScale},
                {"industryShockDecay",     engine.industryShockDecay},
                {"companyShockDecay",      engine.companyShockDecay}
            };

            j["macro"] = {
                {"sentimentMean",             macro.sentimentMean},
                {"sentimentReversion",        macro.sentimentReversion},
                {"sentimentNoiseStd",         macro.sentimentNoiseStd},
                {"volatilityMean",            macro.volatilityMean},
                {"volatilityReversion",       macro.volatilityReversion},
                {"volatilityNoiseStd",        macro.volatilityNoiseStd},
                {"initialInterestRate",       macro.initialInterestRate},
                {"interestRateNoiseStd",      macro.interestRateNoiseStd},
                {"interestRateMin",           macro.interestRateMin},
                {"interestRateMax",           macro.interestRateMax},
                {"globalShockSentimentWeight", macro.globalShockSentimentWeight},
                {"globalShockNoiseStd",       macro.globalShockNoiseStd},
                {"politicalSentimentMult",    macro.politicalSentimentMult},
                {"globalSentimentMult",       macro.globalSentimentMult},
                {"politicalVolImpact",        macro.politicalVolImpact},
                {"negativeVolImpact",         macro.negativeVolImpact}
            };

            j["asset"] = {
                {"circuitBreakerLimit",   asset.circuitBreakerLimit},
                {"impactDampening",       asset.impactDampening},
                {"fundamentalShockClamp", asset.fundamentalShockClamp},
                {"priceFloor",            asset.priceFloor}
            };

            j["orderBook"] = {
                {"orderExpiryMs", orderBook.orderExpiryMs}
            };

            j["agentCounts"] = {
                {"fundamental",   agentCounts.fundamental},
                {"momentum",      agentCounts.momentum},
                {"meanReversion", agentCounts.meanReversion},
                {"noise",         agentCounts.noise},
                {"marketMaker",   agentCounts.marketMaker}
            };

            j["agentCash"] = {
                {"meanCash", agentCash.meanCash},
                {"stdCash",  agentCash.stdCash}
            };

            j["agentGlobal"] = {
                {"capitalFraction",        agentGlobal.capitalFraction},
                {"cashReserve",            agentGlobal.cashReserve},
                {"maxOrderSize",           agentGlobal.maxOrderSize},
                {"sentimentDecayGlobal",   agentGlobal.sentimentDecayGlobal},
                {"sentimentDecayIndustry", agentGlobal.sentimentDecayIndustry},
                {"sentimentDecaySymbol",   agentGlobal.sentimentDecaySymbol}
            };

            j["agentGen"] = {
                {"riskAversionMean",    agentGen.riskAversionMean},
                {"riskAversionStd",     agentGen.riskAversionStd},
                {"riskAversionMin",     agentGen.riskAversionMin},
                {"reactionSpeedLambda", agentGen.reactionSpeedLambda},
                {"newsWeightMin",       agentGen.newsWeightMin},
                {"newsWeightMax",       agentGen.newsWeightMax},
                {"confidenceMin",       agentGen.confidenceMin},
                {"confidenceMax",       agentGen.confidenceMax},
                {"timeHorizonMu",       agentGen.timeHorizonMu},
                {"timeHorizonSigma",    agentGen.timeHorizonSigma}
            };

            j["marketMaker"] = {
                {"baseSpreadMin",           marketMaker.baseSpreadMin},
                {"baseSpreadMax",           marketMaker.baseSpreadMax},
                {"inventorySkewMin",        marketMaker.inventorySkewMin},
                {"inventorySkewMax",        marketMaker.inventorySkewMax},
                {"maxInventoryMin",         marketMaker.maxInventoryMin},
                {"maxInventoryMax",         marketMaker.maxInventoryMax},
                {"initialInventoryPerStock", marketMaker.initialInventoryPerStock},
                {"quoteCapitalFrac",        marketMaker.quoteCapitalFrac},
                {"sentimentSpreadMult",     marketMaker.sentimentSpreadMult},
                {"volatilitySpreadMult",    marketMaker.volatilitySpreadMult},
                {"fundamentalWeight",       marketMaker.fundamentalWeight}
            };

            j["fundamental"] = {
                {"thresholdBase",       fundamental.thresholdBase},
                {"thresholdRiskScale",  fundamental.thresholdRiskScale},
                {"noiseStdBase",        fundamental.noiseStdBase},
                {"noiseStdRange",       fundamental.noiseStdRange},
                {"sentimentImpact",     fundamental.sentimentImpact},
                {"reactionMult",        fundamental.reactionMult},
                {"limitPriceSpreadMax", fundamental.limitPriceSpreadMax}
            };

            j["momentum"] = {
                {"shortPeriodMin",           momentum.shortPeriodMin},
                {"shortPeriodRange",         momentum.shortPeriodRange},
                {"longPeriodOffsetMin",      momentum.longPeriodOffsetMin},
                {"longPeriodOffsetRange",    momentum.longPeriodOffsetRange},
                {"reactionMult",             momentum.reactionMult},
                {"limitOffsetMin",           momentum.limitOffsetMin},
                {"limitOffsetMax",           momentum.limitOffsetMax},
                {"signalThresholdRiskScale", momentum.signalThresholdRiskScale},
                {"industrySentWeight",       momentum.industrySentWeight},
                {"globalSentWeight",         momentum.globalSentWeight}
            };

            j["meanReversion"] = {
                {"lookbackMin",         meanReversion.lookbackMin},
                {"lookbackRange",       meanReversion.lookbackRange},
                {"zThresholdMin",       meanReversion.zThresholdMin},
                {"zThresholdRange",     meanReversion.zThresholdRange},
                {"reactionMult",        meanReversion.reactionMult},
                {"limitPriceSpreadMax", meanReversion.limitPriceSpreadMax},
                {"sentSymbolWeight",    meanReversion.sentSymbolWeight},
                {"sentGlobalWeight",    meanReversion.sentGlobalWeight}
            };

            j["noise"] = {
                {"tradeProbMin",       noise.tradeProbMin},
                {"tradeProbRange",     noise.tradeProbRange},
                {"sentSensitivityMin", noise.sentSensitivityMin},
                {"sentSensitivityMax", noise.sentSensitivityMax},
                {"overreactionMult",   noise.overreactionMult},
                {"marketOrderProb",    noise.marketOrderProb},
                {"sentimentDecay",     noise.sentimentDecay},
                {"industrySentDecay",  noise.industrySentDecay},
                {"symbolSentDecay",    noise.symbolSentDecay},
                {"limitOffsetMin",     noise.limitOffsetMin},
                {"limitOffsetMax",     noise.limitOffsetMax},
                {"confidenceMin",      noise.confidenceMin},
                {"confidenceMax",      noise.confidenceMax},
                {"buyBiasSentWeight",  noise.buyBiasSentWeight},
                {"buyBiasNoiseStd",    noise.buyBiasNoiseStd}
            };

            j["news"] = {
                {"lambda",             news.lambda},
                {"globalImpactStd",    news.globalImpactStd},
                {"politicalImpactStd", news.politicalImpactStd},
                {"industryImpactStd",  news.industryImpactStd},
                {"companyImpactStd",   news.companyImpactStd}
            };

            return j;
        }

        /// Merge-patch: only the keys present in `j` are updated; everything
        /// else keeps its current/default value.
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

            if (j.contains("engine")) {
                auto& e = j["engine"];
                get(e, "annualGrowthRate", engine.annualGrowthRate);
                get(e, "companyShockStd", engine.companyShockStd);
                get(e, "newsToFundamentalScale", engine.newsToFundamentalScale);
                get(e, "industryShockScale", engine.industryShockScale);
                get(e, "industryShockDecay", engine.industryShockDecay);
                get(e, "companyShockDecay", engine.companyShockDecay);
            }

            if (j.contains("macro")) {
                auto& m = j["macro"];
                get(m, "sentimentMean", macro.sentimentMean);
                get(m, "sentimentReversion", macro.sentimentReversion);
                get(m, "sentimentNoiseStd", macro.sentimentNoiseStd);
                get(m, "volatilityMean", macro.volatilityMean);
                get(m, "volatilityReversion", macro.volatilityReversion);
                get(m, "volatilityNoiseStd", macro.volatilityNoiseStd);
                get(m, "initialInterestRate", macro.initialInterestRate);
                get(m, "interestRateNoiseStd", macro.interestRateNoiseStd);
                get(m, "interestRateMin", macro.interestRateMin);
                get(m, "interestRateMax", macro.interestRateMax);
                get(m, "globalShockSentimentWeight", macro.globalShockSentimentWeight);
                get(m, "globalShockNoiseStd", macro.globalShockNoiseStd);
                get(m, "politicalSentimentMult", macro.politicalSentimentMult);
                get(m, "globalSentimentMult", macro.globalSentimentMult);
                get(m, "politicalVolImpact", macro.politicalVolImpact);
                get(m, "negativeVolImpact", macro.negativeVolImpact);
            }

            if (j.contains("asset")) {
                auto& a = j["asset"];
                get(a, "circuitBreakerLimit", asset.circuitBreakerLimit);
                get(a, "impactDampening", asset.impactDampening);
                get(a, "fundamentalShockClamp", asset.fundamentalShockClamp);
                get(a, "priceFloor", asset.priceFloor);
            }

            if (j.contains("orderBook")) {
                auto& o = j["orderBook"];
                get(o, "orderExpiryMs", orderBook.orderExpiryMs);
            }

            if (j.contains("agentCounts")) {
                auto& c = j["agentCounts"];
                get(c, "fundamental", agentCounts.fundamental);
                get(c, "momentum", agentCounts.momentum);
                get(c, "meanReversion", agentCounts.meanReversion);
                get(c, "noise", agentCounts.noise);
                get(c, "marketMaker", agentCounts.marketMaker);
            }

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
                get(g, "sentimentDecayIndustry", agentGlobal.sentimentDecayIndustry);
                get(g, "sentimentDecaySymbol", agentGlobal.sentimentDecaySymbol);
            }

            if (j.contains("agentGen")) {
                auto& g = j["agentGen"];
                get(g, "riskAversionMean", agentGen.riskAversionMean);
                get(g, "riskAversionStd", agentGen.riskAversionStd);
                get(g, "riskAversionMin", agentGen.riskAversionMin);
                get(g, "reactionSpeedLambda", agentGen.reactionSpeedLambda);
                get(g, "newsWeightMin", agentGen.newsWeightMin);
                get(g, "newsWeightMax", agentGen.newsWeightMax);
                get(g, "confidenceMin", agentGen.confidenceMin);
                get(g, "confidenceMax", agentGen.confidenceMax);
                get(g, "timeHorizonMu", agentGen.timeHorizonMu);
                get(g, "timeHorizonSigma", agentGen.timeHorizonSigma);
            }

            if (j.contains("marketMaker")) {
                auto& mm = j["marketMaker"];
                get(mm, "baseSpreadMin", marketMaker.baseSpreadMin);
                get(mm, "baseSpreadMax", marketMaker.baseSpreadMax);
                get(mm, "inventorySkewMin", marketMaker.inventorySkewMin);
                get(mm, "inventorySkewMax", marketMaker.inventorySkewMax);
                get(mm, "maxInventoryMin", marketMaker.maxInventoryMin);
                get(mm, "maxInventoryMax", marketMaker.maxInventoryMax);
                get(mm, "initialInventoryPerStock", marketMaker.initialInventoryPerStock);
                get(mm, "quoteCapitalFrac", marketMaker.quoteCapitalFrac);
                get(mm, "sentimentSpreadMult", marketMaker.sentimentSpreadMult);
                get(mm, "volatilitySpreadMult", marketMaker.volatilitySpreadMult);
                get(mm, "fundamentalWeight", marketMaker.fundamentalWeight);
            }

            if (j.contains("fundamental")) {
                auto& f = j["fundamental"];
                get(f, "thresholdBase", fundamental.thresholdBase);
                get(f, "thresholdRiskScale", fundamental.thresholdRiskScale);
                get(f, "noiseStdBase", fundamental.noiseStdBase);
                get(f, "noiseStdRange", fundamental.noiseStdRange);
                get(f, "sentimentImpact", fundamental.sentimentImpact);
                get(f, "reactionMult", fundamental.reactionMult);
                get(f, "limitPriceSpreadMax", fundamental.limitPriceSpreadMax);
            }

            if (j.contains("momentum")) {
                auto& m = j["momentum"];
                get(m, "shortPeriodMin", momentum.shortPeriodMin);
                get(m, "shortPeriodRange", momentum.shortPeriodRange);
                get(m, "longPeriodOffsetMin", momentum.longPeriodOffsetMin);
                get(m, "longPeriodOffsetRange", momentum.longPeriodOffsetRange);
                get(m, "reactionMult", momentum.reactionMult);
                get(m, "limitOffsetMin", momentum.limitOffsetMin);
                get(m, "limitOffsetMax", momentum.limitOffsetMax);
                get(m, "signalThresholdRiskScale", momentum.signalThresholdRiskScale);
                get(m, "industrySentWeight", momentum.industrySentWeight);
                get(m, "globalSentWeight", momentum.globalSentWeight);
            }

            if (j.contains("meanReversion")) {
                auto& mr = j["meanReversion"];
                get(mr, "lookbackMin", meanReversion.lookbackMin);
                get(mr, "lookbackRange", meanReversion.lookbackRange);
                get(mr, "zThresholdMin", meanReversion.zThresholdMin);
                get(mr, "zThresholdRange", meanReversion.zThresholdRange);
                get(mr, "reactionMult", meanReversion.reactionMult);
                get(mr, "limitPriceSpreadMax", meanReversion.limitPriceSpreadMax);
                get(mr, "sentSymbolWeight", meanReversion.sentSymbolWeight);
                get(mr, "sentGlobalWeight", meanReversion.sentGlobalWeight);
            }

            if (j.contains("noise")) {
                auto& n = j["noise"];
                get(n, "tradeProbMin", noise.tradeProbMin);
                get(n, "tradeProbRange", noise.tradeProbRange);
                get(n, "sentSensitivityMin", noise.sentSensitivityMin);
                get(n, "sentSensitivityMax", noise.sentSensitivityMax);
                get(n, "overreactionMult", noise.overreactionMult);
                get(n, "marketOrderProb", noise.marketOrderProb);
                get(n, "sentimentDecay", noise.sentimentDecay);
                get(n, "industrySentDecay", noise.industrySentDecay);
                get(n, "symbolSentDecay", noise.symbolSentDecay);
                get(n, "limitOffsetMin", noise.limitOffsetMin);
                get(n, "limitOffsetMax", noise.limitOffsetMax);
                get(n, "confidenceMin", noise.confidenceMin);
                get(n, "confidenceMax", noise.confidenceMax);
                get(n, "buyBiasSentWeight", noise.buyBiasSentWeight);
                get(n, "buyBiasNoiseStd", noise.buyBiasNoiseStd);
            }

            if (j.contains("news")) {
                auto& n = j["news"];
                get(n, "lambda", news.lambda);
                get(n, "globalImpactStd", news.globalImpactStd);
                get(n, "politicalImpactStd", news.politicalImpactStd);
                get(n, "industryImpactStd", news.industryImpactStd);
                get(n, "companyImpactStd", news.companyImpactStd);
            }
        }

        /// Populate from the legacy config.json layout (for backwards compat)
        void fromLegacyJson(const nlohmann::json& cfg) {
            auto get = [](const nlohmann::json& obj, const char* key, auto& dst) {
                if (obj.contains(key)) dst = obj[key].get<std::remove_reference_t<decltype(dst)>>();
                };

            if (cfg.contains("simulation")) {
                auto& s = cfg["simulation"];
                get(s, "tick_rate_ms", simulation.tickRateMs);
                get(s, "max_ticks", simulation.maxTicks);
                get(s, "ticks_per_day", simulation.ticksPerDay);
                get(s, "populate_ticks_per_day", simulation.populateTicksPerDay);
                get(s, "populate_fine_ticks_per_day", simulation.populateFineTicksPerDay);
                get(s, "populate_fine_days", simulation.populateFineDays);
                get(s, "start_date", simulation.startDate);
            }

            if (cfg.contains("agents")) {
                auto& a = cfg["agents"];
                get(a, "fundamental_traders", agentCounts.fundamental);
                get(a, "momentum_traders", agentCounts.momentum);
                get(a, "mean_reversion_traders", agentCounts.meanReversion);
                get(a, "noise_traders", agentCounts.noise);
                get(a, "market_makers", agentCounts.marketMaker);
            }

            if (cfg.contains("agent_params")) {
                auto& p = cfg["agent_params"];
                get(p, "initial_cash_mean", agentCash.meanCash);
                get(p, "initial_cash_std", agentCash.stdCash);
                get(p, "risk_aversion_mean", agentGen.riskAversionMean);
                get(p, "risk_aversion_std", agentGen.riskAversionStd);
            }

            if (cfg.contains("news")) {
                auto& n = cfg["news"];
                get(n, "lambda", news.lambda);
                get(n, "global_impact_std", news.globalImpactStd);
                get(n, "industry_impact_std", news.industryImpactStd);
                get(n, "company_impact_std", news.companyImpactStd);
                get(n, "political_impact_std", news.politicalImpactStd);
            }

            if (cfg.contains("market")) {
                auto& m = cfg["market"];
                if (m.contains("spread_base")) {
                    double base = m["spread_base"].get<double>();
                    marketMaker.baseSpreadMin = base;
                    marketMaker.baseSpreadMax = base + 0.002;
                }
            }
        }
    };

} // namespace market
