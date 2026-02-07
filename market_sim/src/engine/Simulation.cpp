#include "Simulation.hpp"
#include "agents/Agent.hpp"
#include "utils/Logger.hpp"
#include "utils/Random.hpp"
#include <fstream>
#include <shared_mutex>

namespace market {

    Simulation::Simulation() {}

    Simulation::~Simulation() {
        stop();
    }

    void Simulation::loadConfig(const std::string& configPath) {
        std::ifstream file(configPath);
        if (!file.is_open()) {
            Logger::warn("Could not open config file: {}, using defaults", configPath);
            return;
        }

        try {
            config_ = nlohmann::json::parse(file);
            loadConfig(config_);
        }
        catch (const std::exception& e) {
            Logger::error("Failed to parse config: {}", e.what());
        }
    }

    void Simulation::loadConfig(const nlohmann::json& config) {
        config_ = config;

        // Populate RuntimeConfig from the legacy config.json layout
        rtConfig_.fromLegacyJson(config);

        // Sync convenience members from rtConfig
        tickRateMs_ = rtConfig_.simulation.tickRateMs;
        maxTicks_ = rtConfig_.simulation.maxTicks;
        ticksPerDay_ = rtConfig_.simulation.ticksPerDay;
        populateTicksPerDay_ = rtConfig_.simulation.populateTicksPerDay;

        // Logging settings (not in RuntimeConfig – keeps Logger decoupled)
        if (config.contains("logging")) {
            auto& log = config["logging"];
            Logger::init(
                log.value("file", "market_sim.log"),
                log.value("level", "info"),
                log.value("console", true)
            );
        }

        // Push news params to the NewsGenerator
        engine_.getNewsGenerator().setLambda(rtConfig_.news.lambda);
        engine_.getNewsGenerator().setGlobalImpactStd(rtConfig_.news.globalImpactStd);
        engine_.getNewsGenerator().setIndustryImpactStd(rtConfig_.news.industryImpactStd);
        engine_.getNewsGenerator().setCompanyImpactStd(rtConfig_.news.companyImpactStd);
        engine_.getNewsGenerator().setPoliticalImpactStd(rtConfig_.news.politicalImpactStd);

        Logger::info("Configuration loaded (RuntimeConfig populated)");
    }

    void Simulation::loadStocks(const std::string& stocksPath) {
        std::ifstream file(stocksPath);
        if (!file.is_open()) {
            Logger::warn("Could not open stocks file: {}, using defaults", stocksPath);
            return;
        }

        try {
            stocksData_ = nlohmann::json::parse(file);
            Logger::info("Loaded {} stocks from {}",
                stocksData_.contains("stocks") ? stocksData_["stocks"].size() : 0,
                stocksPath);
        }
        catch (const std::exception& e) {
            Logger::error("Failed to parse stocks file: {}", e.what());
        }
    }

    void Simulation::initialize() {
        Logger::info("Initializing simulation...");

        // Initialize SimClock with normal ticks per day
        std::string startDate = rtConfig_.simulation.startDate;
        engine_.getSimClock().initialize(startDate, ticksPerDay_);

        // Give engine a pointer to our RuntimeConfig
        engine_.setRuntimeConfig(&rtConfig_);

        // Create assets from stocks.json or fall back to defaults
        if (stocksData_.contains("stocks") && !stocksData_["stocks"].empty()) {
            createAssetsFromStocks();
        }
        else {
            createDefaultAssets();
        }

        createDefaultAgents();

        // Seed market-maker inventory so they can post asks from tick 0
        seedMarketMakerInventory();

        // Mark initial day-open prices for circuit breakers + set asset config
        for (auto& [symbol, asset] : engine_.getAssets()) {
            asset->setMaxDailyMove(rtConfig_.asset.circuitBreakerLimit);
            asset->setImpactDampening(rtConfig_.asset.impactDampening);
            asset->setFundamentalShockClamp(rtConfig_.asset.fundamentalShockClamp);
            asset->setPriceFloor(rtConfig_.asset.priceFloor);
            asset->markDayOpen();
        }

        Logger::info("Simulation initialized with {} assets and {} agents (start date: {})",
            engine_.getAssets().size(), engine_.getAgents().size(), startDate);
    }

    void Simulation::reinitialize() {
        Logger::info("Re-initializing simulation from RuntimeConfig...");
        stop();
        engine_.reset();
        currentTick_ = 0;

        tickRateMs_ = rtConfig_.simulation.tickRateMs;
        maxTicks_ = rtConfig_.simulation.maxTicks;
        ticksPerDay_ = rtConfig_.simulation.ticksPerDay;
        populateTicksPerDay_ = rtConfig_.simulation.populateTicksPerDay;

        // Push news params
        engine_.getNewsGenerator().setLambda(rtConfig_.news.lambda);
        engine_.getNewsGenerator().setGlobalImpactStd(rtConfig_.news.globalImpactStd);
        engine_.getNewsGenerator().setIndustryImpactStd(rtConfig_.news.industryImpactStd);
        engine_.getNewsGenerator().setCompanyImpactStd(rtConfig_.news.companyImpactStd);
        engine_.getNewsGenerator().setPoliticalImpactStd(rtConfig_.news.politicalImpactStd);

        initialize();
        Logger::info("Re-initialization complete");
    }

    void Simulation::createAssetsFromStocks() {
        for (const auto& stock : stocksData_["stocks"]) {
            std::string symbol = stock["symbol"];
            std::string industry = stock["industry"];
            double price = stock["initialPrice"];
            std::string name = stock.value("name", symbol);
            std::string description = stock.value("description", "");
            std::string sectorDetail = stock.value("sector_detail", "");
            std::string character = stock.value("character", "mid_cap");
            double baseVolatility = stock.value("baseVolatility", 0.025);
            int64_t sharesOutstanding = stock.value("sharesOutstanding", static_cast<int64_t>(1e9));

            auto asset = std::make_unique<Asset>(
                symbol, name, industry, price, baseVolatility, sharesOutstanding,
                description, sectorDetail, character
            );

            engine_.addAsset(std::move(asset));

            Logger::info("Loaded stock {} ({}) - {} @ ${:.2f}", symbol, name, industry, price);
        }
    }

    void Simulation::createDefaultAssets() {
        // Fallback: create a few default assets if no stocks.json loaded
        std::vector<std::tuple<std::string, std::string, double>> defaults = {
            {"NXON", "Technology", 245.0},
            {"QBIT", "Technology", 89.50},
            {"AXFN", "Finance", 178.0},
            {"MEDX", "Healthcare", 312.0},
            {"ELIX", "Energy", 67.25}
        };

        for (const auto& [symbol, industry, price] : defaults) {
            engine_.addAsset(std::make_unique<Asset>(symbol, symbol, industry, price));
        }
    }

    void Simulation::createDefaultAgents() {
        int numFundamental = rtConfig_.agentCounts.fundamental;
        int numMomentum = rtConfig_.agentCounts.momentum;
        int numMeanReversion = rtConfig_.agentCounts.meanReversion;
        int numNoise = rtConfig_.agentCounts.noise;
        int numMarketMakers = rtConfig_.agentCounts.marketMaker;
        double meanCash = rtConfig_.agentCash.meanCash;
        double stdCash = rtConfig_.agentCash.stdCash;

        auto agents = AgentFactory::createPopulation(
            numFundamental, numMomentum, numMeanReversion,
            numNoise, numMarketMakers, meanCash, stdCash,
            &rtConfig_
        );

        engine_.addAgents(std::move(agents));
    }

    void Simulation::seedMarketMakerInventory() {
        int seedQty = rtConfig_.marketMaker.initialInventoryPerStock;
        if (seedQty <= 0) return;

        std::vector<std::string> symbols;
        for (const auto& [sym, _] : engine_.getAssets()) {
            symbols.push_back(sym);
        }

        for (auto& agent : engine_.getMutableAgents()) {
            if (agent->getType() == "MarketMaker") {
                for (const auto& sym : symbols) {
                    auto* asset = engine_.getAsset(sym);
                    if (!asset) continue;
                    agent->seedInventory(sym, seedQty, asset->getPrice());
                }
            }
        }
        Logger::info("Seeded market makers with {} shares per stock", seedQty);
    }

    void Simulation::populate(int days, const std::string& startDate) {
        Logger::info("Populating {} days of history starting from {}", days, startDate);
        populating_ = true;

        // Re-init SimClock for fast populate mode
        engine_.getSimClock().initialize(startDate, populateTicksPerDay_);

        int totalTicks = days * populateTicksPerDay_;
        for (int i = 0; i < totalTicks; ++i) {
            engine_.tick();
            currentTick_++;

            if (i % (populateTicksPerDay_ * 10) == 0) {
                Logger::info("Populate progress: day {}/{} ({})",
                    i / populateTicksPerDay_, days,
                    engine_.getSimClock().currentDateString());
            }
        }

        // Switch back to normal mode ticks per day after populating
        engine_.getSimClock().setTicksPerDay(ticksPerDay_);

        populating_ = false;
        Logger::info("Populate complete. Current sim date: {}",
            engine_.getSimClock().currentDateString());
    }

    void Simulation::restore(const nlohmann::json& stateData) {
        Logger::info("Restoring simulation state...");

        // Restore SimClock position
        if (stateData.contains("simDate") && stateData.contains("tickOfDay")) {
            std::string date = stateData["simDate"];
            int tickOfDay = stateData["tickOfDay"];
            engine_.getSimClock().initialize(date, ticksPerDay_);
            // Advance to the right tick of day
            for (int i = 0; i < tickOfDay; ++i) {
                engine_.getSimClock().tick();
            }
        }

        // Restore asset prices
        if (stateData.contains("prices")) {
            for (auto& [symbol, price] : stateData["prices"].items()) {
                auto* asset = engine_.getAsset(symbol);
                if (asset) {
                    asset->setPrice(price.get<double>());
                }
            }
        }

        // Restore candles if provided
        if (stateData.contains("candles")) {
            // Candles would be loaded by the backend sync service
            // The C++ side just needs prices; candles are re-served from DB
            Logger::info("Candle data acknowledged (served from database)");
        }

        Logger::info("State restored. Sim date: {}", engine_.getSimClock().currentDateString());
    }

    void Simulation::start() {
        if (running_.load()) {
            Logger::warn("Simulation already running");
            return;
        }

        running_ = true;
        paused_ = false;

        simThread_ = std::thread(&Simulation::runLoop, this);

        Logger::info("Simulation started (tick rate: {}ms)", tickRateMs_);
    }

    void Simulation::pause() {
        paused_ = true;
        Logger::info("Simulation paused at tick {}", currentTick_.load());
    }

    void Simulation::resume() {
        paused_ = false;
        Logger::info("Simulation resumed");
    }

    void Simulation::stop() {
        running_ = false;

        if (simThread_.joinable()) {
            simThread_.join();
        }

        Logger::info("Simulation stopped at tick {}", currentTick_.load());
    }

    void Simulation::reset() {
        stop();
        engine_.reset();
        currentTick_ = 0;
        Logger::info("Simulation reset");
    }

    void Simulation::step(int count) {
        std::unique_lock<std::shared_mutex> lock(engineMutex_);
        for (int i = 0; i < count; ++i) {
            engine_.tick();
            currentTick_++;
        }
    }

    void Simulation::runLoop() {
        while (running_.load()) {
            if (!paused_.load()) {
                {
                    std::unique_lock<std::shared_mutex> lock(engineMutex_);
                    engine_.tick();
                }
                currentTick_++;

                if (maxTicks_ > 0 && currentTick_.load() >= static_cast<uint64_t>(maxTicks_)) {
                    Logger::info("Reached max ticks ({}), stopping", maxTicks_);
                    running_ = false;
                    break;
                }
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(tickRateMs_));
        }
    }

    nlohmann::json Simulation::getStateJson() const {
        std::shared_lock<std::shared_mutex> lock(engineMutex_);
        nlohmann::json state;
        state["tick"] = currentTick_.load();
        state["running"] = running_.load();
        state["paused"] = paused_.load();
        state["populating"] = populating_.load();
        state["tickRateMs"] = tickRateMs_;

        // Simulated time info
        auto& clock = engine_.getSimClock();
        state["simDate"] = clock.currentDateString();
        state["simDateTime"] = clock.currentDateTimeString();
        state["simTimestamp"] = clock.currentTimestamp();

        auto& macro = engine_.getMacroEnvironment();
        state["macro"] = {
            {"globalSentiment", macro.getGlobalSentiment()},
            {"interestRate", macro.getInterestRate()},
            {"riskIndex", macro.getRiskIndex()},
            {"volatilityIndex", macro.getVolatilityIndex()}
        };

        return state;
    }

    nlohmann::json Simulation::getAssetsJson() const {
        std::shared_lock<std::shared_mutex> lock(engineMutex_);
        nlohmann::json assets = nlohmann::json::array();

        for (const auto& [symbol, asset] : engine_.getAssets()) {
            nlohmann::json a;
            a["symbol"] = symbol;
            a["name"] = asset->getName();
            a["industry"] = asset->getIndustry();
            a["sectorDetail"] = asset->getSectorDetail();
            a["character"] = asset->getCharacter();
            a["price"] = asset->getPrice();
            a["fundamental"] = asset->getFundamentalValue();
            a["volume"] = asset->getDailyVolume();
            a["mispricing"] = asset->getMispricing();
            a["return"] = asset->getReturn(1);
            a["volatility"] = asset->getVolatilityEstimate(20);
            a["marketCap"] = asset->getMarketCap();

            // Last 50 prices for charting
            const auto& history = asset->getPriceHistory();
            int start = std::max(0, static_cast<int>(history.size()) - 50);
            a["priceHistory"] = std::vector<double>(history.begin() + start, history.end());

            assets.push_back(a);
        }

        return assets;
    }

    nlohmann::json Simulation::getStockInfoJson() const {
        // Return stock metadata for frontend display
        if (stocksData_.contains("stocks")) {
            return stocksData_["stocks"];
        }
        return nlohmann::json::array();
    }

    nlohmann::json Simulation::getAgentSummaryJson() const {
        std::shared_lock<std::shared_mutex> lock(engineMutex_);
        std::map<std::string, int> typeCounts;
        std::map<std::string, double> typeCash;
        std::map<std::string, double> typePortfolioValue;
        std::map<std::string, double> typeSentiment;
        std::map<std::string, int> typeTotalPositions;

        // Gather current prices for portfolio valuation
        std::map<std::string, Price> prices;
        for (const auto& [sym, asset] : engine_.getAssets()) {
            prices[sym] = asset->getPrice();
        }

        for (const auto& agent : engine_.getAgents()) {
            const auto& type = agent->getType();
            typeCounts[type]++;
            typeCash[type] += agent->getCash();
            typePortfolioValue[type] += agent->getPortfolioValue(prices);
            typeSentiment[type] += agent->getSentimentBias();
            typeTotalPositions[type] += static_cast<int>(agent->getPortfolio().size());
        }

        // Per-type order/trade stats
        const auto& agentStats = engine_.getAgentTypeStats();

        nlohmann::json summary = nlohmann::json::array();
        for (const auto& [type, count] : typeCounts) {
            nlohmann::json entry = {
                {"type", type},
                {"count", count},
                {"totalCash", typeCash[type]},
                {"avgCash", typeCash[type] / count},
                {"totalPortfolioValue", typePortfolioValue[type]},
                {"avgPortfolioValue", typePortfolioValue[type] / count},
                {"avgSentiment", typeSentiment[type] / count},
                {"totalPositions", typeTotalPositions[type]}
            };

            // Attach order/trade stats if available
            auto sit = agentStats.find(type);
            if (sit != agentStats.end()) {
                entry["ordersPlaced"] = sit->second.ordersPlaced;
                entry["buyOrders"] = sit->second.buyOrders;
                entry["sellOrders"] = sit->second.sellOrders;
                entry["fills"] = sit->second.fills;
                entry["volumeTraded"] = sit->second.volumeTraded;
                entry["cashSpent"] = sit->second.cashSpent;
                entry["cashReceived"] = sit->second.cashReceived;
            }

            summary.push_back(entry);
        }

        return summary;
    }

    nlohmann::json Simulation::getMetricsJson() const {
        std::shared_lock<std::shared_mutex> lock(engineMutex_);
        auto metrics = engine_.getMetrics();

        nlohmann::json j;
        j["totalTicks"] = metrics.totalTicks;
        j["totalTrades"] = metrics.totalTrades;
        j["totalOrders"] = metrics.totalOrders;
        j["avgSpread"] = metrics.avgSpread;
        j["returns"] = metrics.returns;

        // Per-agent-type stats
        nlohmann::json statsJson;
        for (const auto& [type, stats] : metrics.agentTypeStats) {
            statsJson[type] = {
                {"ordersPlaced", stats.ordersPlaced},
                {"buyOrders", stats.buyOrders},
                {"sellOrders", stats.sellOrders},
                {"fills", stats.fills},
                {"volumeTraded", stats.volumeTraded},
                {"cashSpent", stats.cashSpent},
                {"cashReceived", stats.cashReceived}
            };
        }
        j["agentTypeStats"] = statsJson;

        return j;
    }

} // namespace market
