#pragma once

#include "MarketEngine.hpp"
#include "core/RuntimeConfig.hpp"
#include "core/TickBuffer.hpp"
#include <atomic>
#include <thread>
#include <shared_mutex>
#include <chrono>
#include <nlohmann/json.hpp>

namespace market {

    class Simulation {
    public:
        Simulation();
        ~Simulation();

        void loadConfig(const std::string& configPath);
        void loadConfig(const nlohmann::json& config);

        void loadCommodities(const std::string& commoditiesPath);

        void initialize();
        void reinitialize();

        void populate(int days, const std::string& startDate = "2025-01-01");
        void populateTicks(uint64_t targetTicks, const std::string& startDate = "2025-01-01");

        void restore(const nlohmann::json& stateData);

        void start();
        void pause();
        void resume();
        void stop();
        void reset();

        void step(int count = 1);

        bool isRunning() const { return running_.load(); }
        bool isPaused() const { return paused_.load(); }
        bool isPopulating() const { return populating_.load(); }
        uint64_t getCurrentTick() const { return currentTick_.load(); }

        int getPopulateTargetDays() const { return populateTargetDays_.load(); }
        int getPopulateCurrentDay() const { return populateCurrentDay_.load(); }
        std::string getPopulateStartDate() const;

        void setTickRate(int ms) { tickRateMs_ = ms; }
        int getTickRate() const { return tickRateMs_; }

        RuntimeConfig& getRuntimeConfig() { return rtConfig_; }
        const RuntimeConfig& getRuntimeConfig() const { return rtConfig_; }

        MarketEngine& getEngine() { return engine_; }
        const MarketEngine& getEngine() const { return engine_; }

        std::shared_mutex& getEngineMutex() { return engineMutex_; }

        TickBuffer& getTickBuffer() { return tickBuffer_; }
        const TickBuffer& getTickBuffer() const { return tickBuffer_; }

        nlohmann::json getStateJson() const;
        nlohmann::json getCommoditiesJson() const;
        nlohmann::json getAgentSummaryJson() const;
        nlohmann::json getMetricsJson() const;

    private:
        MarketEngine engine_;
        RuntimeConfig rtConfig_;
        TickBuffer tickBuffer_;
        mutable std::shared_mutex engineMutex_;

        std::atomic<bool> running_{ false };
        std::atomic<bool> paused_{ false };
        std::atomic<bool> populating_{ false };
        std::atomic<uint64_t> currentTick_{ 0 };

        std::atomic<int> populateTargetDays_{ 0 };
        std::atomic<int> populateCurrentDay_{ 0 };
        std::string populateStartDate_;

        int tickRateMs_ = 50;
        int maxTicks_ = 0;
        int ticksPerDay_ = 72000;
        int populateTicksPerDay_ = 576;
        int populateFineTicksPerDay_ = 1440;
        int populateFineDays_ = 7;

        std::thread simThread_;

        nlohmann::json commoditiesData_;
        nlohmann::json config_;

        void runLoop();
        void initializeUnlocked();  // initialize without locking engineMutex_
        void createCommoditiesFromConfig();
        void createDefaultCommodities();
        void createDefaultAgents();
        void seedMarketMakerInventory();
        void recordTickToBuffer();
    };

} // namespace market
