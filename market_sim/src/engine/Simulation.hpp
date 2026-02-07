#pragma once

#include "MarketEngine.hpp"
#include "core/RuntimeConfig.hpp"
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

        // Load configuration
        void loadConfig(const std::string& configPath);
        void loadConfig(const nlohmann::json& config);

        // Load stocks from JSON file
        void loadStocks(const std::string& stocksPath);

        // Initialize with defaults
        void initialize();

        // Re-create agents + assets from current RuntimeConfig (hot reload)
        void reinitialize();

        // Populate historical data (fast-forward N sim-days)
        void populate(int days, const std::string& startDate = "2025-08-07");

        // Restore from external data (candles, clock state)
        void restore(const nlohmann::json& stateData);

        // Control
        void start();
        void pause();
        void resume();
        void stop();
        void reset();

        // Step mode
        void step(int count = 1);

        // Status
        bool isRunning() const { return running_.load(); }
        bool isPaused() const { return paused_.load(); }
        bool isPopulating() const { return populating_.load(); }
        uint64_t getCurrentTick() const { return currentTick_.load(); }

        // Configuration
        void setTickRate(int ms) { tickRateMs_ = ms; }
        int getTickRate() const { return tickRateMs_; }

        // RuntimeConfig access (for API and agents)
        RuntimeConfig& getRuntimeConfig() { return rtConfig_; }
        const RuntimeConfig& getRuntimeConfig() const { return rtConfig_; }

        // Access to engine
        MarketEngine& getEngine() { return engine_; }
        const MarketEngine& getEngine() const { return engine_; }

        // Thread-safe lock access for API callers
        std::shared_mutex& getEngineMutex() { return engineMutex_; }

        // Get state as JSON
        nlohmann::json getStateJson() const;
        nlohmann::json getAssetsJson() const;
        nlohmann::json getAgentSummaryJson() const;
        nlohmann::json getMetricsJson() const;
        nlohmann::json getStockInfoJson() const;

    private:
        MarketEngine engine_;
        RuntimeConfig rtConfig_;                 // central tunable config
        mutable std::shared_mutex engineMutex_;  // protects all engine state

        std::atomic<bool> running_{ false };
        std::atomic<bool> paused_{ false };
        std::atomic<bool> populating_{ false };
        std::atomic<uint64_t> currentTick_{ 0 };

        int tickRateMs_ = 50;
        int maxTicks_ = 0;  // 0 = unlimited
        int ticksPerDay_ = 72000;       // Normal mode
        int populateTicksPerDay_ = 100; // Populate mode (fast)

        std::thread simThread_;

        // Stock data loaded from JSON
        nlohmann::json stocksData_;

        // Configuration (legacy JSON blob)
        nlohmann::json config_;

        void runLoop();
        void createAssetsFromStocks();
        void createDefaultAssets();
        void createDefaultAgents();
        void seedMarketMakerInventory();
    };

} // namespace market
