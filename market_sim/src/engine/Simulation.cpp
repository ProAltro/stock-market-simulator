#include "Simulation.hpp"
#include "agents/Agent.hpp"
#include "utils/Logger.hpp"
#include "utils/Random.hpp"
#include <fstream>
#include <iostream>

namespace market {

    Simulation::Simulation() : tickBuffer_(1000000) {}

    Simulation::~Simulation() {
        stop();
    }

    void Simulation::loadConfig(const std::string& configPath) {
        std::ifstream file(configPath);
        if (!file.is_open()) {
            Logger::warn("Config file not found: {}, using defaults", configPath);
            return;
        }

        nlohmann::json config;
        file >> config;
        loadConfig(config);
    }

    void Simulation::loadConfig(const nlohmann::json& config) {
        config_ = config;
        rtConfig_.fromJson(config);

        if (config.contains("simulation")) {
            auto& s = config["simulation"];
            if (s.contains("tick_rate_ms")) tickRateMs_ = s["tick_rate_ms"].get<int>();
            if (s.contains("max_ticks")) maxTicks_ = s["max_ticks"].get<int>();
            if (s.contains("ticks_per_day")) ticksPerDay_ = s["ticks_per_day"].get<int>();
            if (s.contains("populate_ticks_per_day")) populateTicksPerDay_ = s["populate_ticks_per_day"].get<int>();
            if (s.contains("populate_fine_ticks_per_day")) populateFineTicksPerDay_ = s["populate_fine_ticks_per_day"].get<int>();
            if (s.contains("populate_fine_days")) populateFineDays_ = s["populate_fine_days"].get<int>();
        }

        Logger::info("Config loaded: tickRate={}ms, ticksPerDay={}", tickRateMs_, ticksPerDay_);
    }

    void Simulation::loadCommodities(const std::string& commoditiesPath) {
        std::ifstream file(commoditiesPath);
        if (!file.is_open()) {
            Logger::error("Commodities file not found: {}", commoditiesPath);
            return;
        }

        file >> commoditiesData_;
        Logger::info("Loaded {} commodities from {}", commoditiesData_["commodities"].size(), commoditiesPath);
    }

    void Simulation::initialize() {
        std::unique_lock lock(engineMutex_);
        initializeUnlocked();
    }

    void Simulation::initializeUnlocked() {
        engine_.setRuntimeConfig(&rtConfig_);

        if (!commoditiesData_.is_null() && commoditiesData_.contains("commodities")) {
            createCommoditiesFromConfig();
        }
        else {
            createDefaultCommodities();
        }

        createDefaultAgents();
        seedMarketMakerInventory();

        engine_.getSimClock().initialize(rtConfig_.simulation.startDate, ticksPerDay_);

        tickBuffer_.clear();
        for (const auto& [symbol, commodity] : engine_.getCommodities()) {
            tickBuffer_.addSymbol(symbol);
        }

        Logger::info("Simulation initialized with {} commodities and {} agents",
            engine_.getCommodities().size(), engine_.getAgents().size());
    }

    void Simulation::reinitialize() {
        Logger::info("[SIM] reinitialize() - acquiring lock...");
        std::unique_lock lock(engineMutex_);
        Logger::info("[SIM] reinitialize() - lock acquired, resetting engine");
        engine_.reset();
        initializeUnlocked();
        Logger::info("[SIM] reinitialize() - done");
    }

    void Simulation::createCommoditiesFromConfig() {
        for (const auto& c : commoditiesData_["commodities"]) {
            std::string symbol = c.value("symbol", "");
            std::string name = c.value("name", symbol);
            std::string category = c.value("category", "General");
            double initialPrice = c.value("initialPrice", 50.0);
            double baseProduction = c.value("baseProduction", 100.0);
            double baseConsumption = c.value("baseConsumption", 100.0);
            double volatility = c.value("volatility", 0.02);
            double initialInventory = c.value("initialInventory", 50.0);

            auto commodity = std::make_unique<Commodity>(
                symbol, name, category, initialPrice,
                baseProduction, baseConsumption, volatility, initialInventory
            );

            // Apply runtime config to commodity
            commodity->setImpactDampening(rtConfig_.commodity.impactDampening);
            commodity->setPriceFloor(rtConfig_.commodity.priceFloor);
            commodity->setMaxDailyMove(rtConfig_.commodity.circuitBreakerLimit);
            commodity->setSupplyDecayRate(rtConfig_.commodity.supplyDecayRate);
            commodity->setDemandDecayRate(rtConfig_.commodity.demandDecayRate);

            if (c.contains("crossEffects")) {
                std::vector<CrossEffect> effects;
                for (auto it = c["crossEffects"].begin(); it != c["crossEffects"].end(); ++it) {
                    CrossEffect effect;
                    effect.targetSymbol = it.key();
                    effect.coefficient = it.value().get<double>();
                    effects.push_back(effect);
                }
                engine_.setCrossEffects(symbol, effects);
            }

            engine_.addCommodity(std::move(commodity));
        }
    }

    void Simulation::createDefaultCommodities() {
        std::vector<std::tuple<std::string, std::string, std::string, double>> defaults = {
            {"OIL", "Crude Oil", "Energy", 75.0},
            {"STEEL", "Steel", "Construction", 120.0},
            {"WOOD", "Lumber", "Construction", 45.0},
            {"BRICK", "Brick", "Construction", 25.0},
            {"GRAIN", "Grain", "Agriculture", 8.0}
        };

        for (const auto& [sym, name, cat, price] : defaults) {
            auto commodity = std::make_unique<Commodity>(sym, name, cat, price);
            // Apply runtime config to commodity
            commodity->setImpactDampening(rtConfig_.commodity.impactDampening);
            commodity->setPriceFloor(rtConfig_.commodity.priceFloor);
            commodity->setMaxDailyMove(rtConfig_.commodity.circuitBreakerLimit);
            commodity->setSupplyDecayRate(rtConfig_.commodity.supplyDecayRate);
            commodity->setDemandDecayRate(rtConfig_.commodity.demandDecayRate);
            engine_.addCommodity(std::move(commodity));
        }

        engine_.setCrossEffects("OIL", { {"STEEL", 0.25}, {"BRICK", 0.15}, {"WOOD", 0.10} });
        engine_.setCrossEffects("STEEL", { {"OIL", 0.30}, {"BRICK", 0.35}, {"WOOD", 0.20} });
        engine_.setCrossEffects("WOOD", { {"BRICK", 0.30}, {"STEEL", 0.15} });
        engine_.setCrossEffects("BRICK", { {"STEEL", 0.40}, {"WOOD", 0.35} });
    }

    void Simulation::createDefaultAgents() {
        auto agents = AgentFactory::createPopulation(
            rtConfig_.agentCounts.supplyDemand,
            rtConfig_.agentCounts.momentum,
            rtConfig_.agentCounts.meanReversion,
            rtConfig_.agentCounts.noise,
            rtConfig_.agentCounts.marketMaker,
            rtConfig_.agentCounts.crossEffects,
            rtConfig_.agentCounts.inventory,
            rtConfig_.agentCounts.event,
            rtConfig_.agentCash.meanCash,
            rtConfig_.agentCash.stdCash,
            &rtConfig_
        );

        engine_.addAgents(std::move(agents));
    }

    void Simulation::seedMarketMakerInventory() {
        int invPerCommodity = rtConfig_.marketMaker.initialInventoryPerCommodity;

        for (auto& agent : engine_.getMutableAgents()) {
            if (agent->getType() == "MarketMaker") {
                for (const auto& [symbol, commodity] : engine_.getCommodities()) {
                    agent->seedInventory(symbol, invPerCommodity, commodity->getPrice());
                }
            }
        }
    }

    void Simulation::populate(int days, const std::string& startDate) {
        populating_ = true;
        populateTargetDays_ = days;
        populateCurrentDay_ = 0;
        populateStartDate_ = startDate;

        std::unique_lock lock(engineMutex_);

        int normalDays = std::max(0, days - populateFineDays_);
        int fineDays = std::min(populateFineDays_, days);

        engine_.getSimClock().initialize(startDate, populateTicksPerDay_);
        engine_.getSimClock().setReferenceTicksPerDay(populateTicksPerDay_);

        if (normalDays > 0) {
            int totalTicks = normalDays * populateTicksPerDay_;
            for (int i = 0; i < totalTicks; ++i) {
                engine_.tick();
                currentTick_++;
                recordTickToBuffer();

                if (i % populateTicksPerDay_ == 0) {
                    populateCurrentDay_ = i / populateTicksPerDay_;
                }

                if (i % (populateTicksPerDay_ * 10) == 0) {
                    Logger::info("Populate progress: day {}/{} ({})",
                        i / populateTicksPerDay_, days,
                        engine_.getSimClock().currentDateString());
                }
            }
            Logger::info("Phase 1 complete: {} normal days populated", normalDays);
        }

        if (fineDays > 0) {
            engine_.getSimClock().setTicksPerDay(populateFineTicksPerDay_);
            engine_.getSimClock().setReferenceTicksPerDay(populateFineTicksPerDay_);

            int totalTicks = fineDays * populateFineTicksPerDay_;
            for (int i = 0; i < totalTicks; ++i) {
                engine_.tick();
                currentTick_++;
                recordTickToBuffer();

                if (i % populateFineTicksPerDay_ == 0) {
                    populateCurrentDay_ = normalDays + (i / populateFineTicksPerDay_);
                }

                if (i % (populateFineTicksPerDay_ * 2) == 0) {
                    Logger::info("Fine populate progress: day {}/{} ({})",
                        normalDays + (i / populateFineTicksPerDay_), days,
                        engine_.getSimClock().currentDateString());
                }
            }
            Logger::info("Phase 2 complete: {} fine days populated", fineDays);
        }

        engine_.getSimClock().setTicksPerDay(ticksPerDay_);
        populateCurrentDay_ = days;
        populating_ = false;
        populateTargetDays_ = 0;

        Logger::info("Populate complete. Current sim date: {}",
            engine_.getSimClock().currentDateString());
    }

    void Simulation::populateTicks(uint64_t targetTicks, const std::string& startDate) {
        populating_ = true;
        populateTargetDays_ = 0;
        populateCurrentDay_ = 0;
        populateStartDate_ = startDate;

        std::unique_lock lock(engineMutex_);

        tickBuffer_.clear();
        for (const auto& [symbol, commodity] : engine_.getCommodities()) {
            tickBuffer_.addSymbol(symbol);
        }

        engine_.getSimClock().initialize(startDate, populateTicksPerDay_);
        engine_.getSimClock().setReferenceTicksPerDay(populateTicksPerDay_);

        Logger::info("Populating {} ticks...", targetTicks);

        uint64_t reportInterval = targetTicks / 20;
        if (reportInterval == 0) reportInterval = 10000;

        for (uint64_t i = 0; i < targetTicks; ++i) {
            engine_.tick();
            currentTick_ = i + 1;
            recordTickToBuffer();

            if (i % reportInterval == 0) {
                Logger::info("Populate progress: {}/{} ticks ({:.1f}%)",
                    i + 1, targetTicks, 100.0 * (i + 1) / targetTicks);
            }
        }

        populating_ = false;
        Logger::info("Populate complete. Total ticks: {}", currentTick_.load());
    }

    void Simulation::start() {
        if (running_.load()) return;

        running_ = true;
        paused_ = false;

        simThread_ = std::thread(&Simulation::runLoop, this);
        Logger::info("Simulation started");
    }

    void Simulation::pause() {
        paused_ = true;
        Logger::info("Simulation paused");
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
        Logger::info("Simulation stopped");
    }

    void Simulation::reset() {
        stop();
        currentTick_ = 0;
        std::unique_lock lock(engineMutex_);
        engine_.reset();
        Logger::info("Simulation reset");
    }

    void Simulation::step(int count) {
        std::unique_lock lock(engineMutex_);
        for (int i = 0; i < count; ++i) {
            engine_.tick();
            currentTick_++;
            recordTickToBuffer();

            if (maxTicks_ > 0 && currentTick_ >= maxTicks_) {
                break;
            }
        }
    }

    void Simulation::runLoop() {
        while (running_.load()) {
            if (!paused_.load()) {
                step(1);

                if (maxTicks_ > 0 && currentTick_ >= maxTicks_) {
                    running_ = false;
                    break;
                }
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(tickRateMs_));
        }
    }

    std::string Simulation::getPopulateStartDate() const {
        return populateStartDate_;
    }

    nlohmann::json Simulation::getStateJson() const {
        // No mutex needed — all fields are std::atomic, so /state works during populate
        nlohmann::json state;
        state["running"] = running_.load();
        state["paused"] = paused_.load();
        state["populating"] = populating_.load();
        state["currentTick"] = currentTick_.load();
        state["populateProgress"] = {
            {"target", populateTargetDays_.load()},
            {"current", populateCurrentDay_.load()}
        };
        // simDate needs the engine — only safe when not populating
        if (!populating_.load()) {
            try {
                std::shared_lock lock(engineMutex_);
                state["simDate"] = engine_.getSimClock().currentDateString();
            }
            catch (...) {
                state["simDate"] = "unknown";
            }
        }
        else {
            state["simDate"] = "populating...";
        }
        return state;
    }

    nlohmann::json Simulation::getCommoditiesJson() const {
        std::shared_lock lock(engineMutex_);

        nlohmann::json arr = nlohmann::json::array();
        for (const auto& [symbol, commodity] : engine_.getCommodities()) {
            nlohmann::json c;
            c["symbol"] = symbol;
            c["name"] = commodity->getName();
            c["category"] = commodity->getCategory();
            c["price"] = commodity->getPrice();
            c["dailyVolume"] = commodity->getDailyVolume();
            c["supplyDemand"] = {
                {"production", commodity->getSupplyDemand().production},
                {"consumption", commodity->getSupplyDemand().consumption},
                {"imports", commodity->getSupplyDemand().imports},
                {"exports", commodity->getSupplyDemand().exports},
                {"inventory", commodity->getSupplyDemand().inventory},
                {"imbalance", commodity->getSupplyDemand().getImbalance()}
            };
            arr.push_back(c);
        }
        return arr;
    }

    nlohmann::json Simulation::getAgentSummaryJson() const {
        std::shared_lock lock(engineMutex_);

        std::map<std::string, int> counts;
        for (const auto& agent : engine_.getAgents()) {
            counts[agent->getType()]++;
        }

        nlohmann::json arr = nlohmann::json::array();
        for (const auto& [type, count] : counts) {
            arr.push_back({ {"type", type}, {"count", count} });
        }
        return arr;
    }

    nlohmann::json Simulation::getMetricsJson() const {
        std::shared_lock lock(engineMutex_);

        auto metrics = engine_.getMetrics();
        nlohmann::json m;
        m["totalTicks"] = metrics.totalTicks;
        m["totalTrades"] = metrics.totalTrades;
        m["totalOrders"] = metrics.totalOrders;
        m["avgSpread"] = metrics.avgSpread;
        return m;
    }

    void Simulation::restore(const nlohmann::json& stateData) {
        Logger::warn("State restoration not yet implemented");
        throw std::runtime_error("State restoration not implemented");
    }

    void Simulation::recordTickToBuffer() {
        for (const auto& [symbol, commodity] : engine_.getCommodities()) {
            Price price = commodity->getPrice();
            tickBuffer_.recordTick(symbol, price, price, price, price, 0);
        }
        tickBuffer_.advanceTick();
    }

} // namespace market
