#pragma once

#include "core/Types.hpp"
#include "core/Asset.hpp"
#include "core/OrderBook.hpp"
#include "core/SimClock.hpp"
#include "core/CandleAggregator.hpp"
#include "core/RuntimeConfig.hpp"
#include "agents/Agent.hpp"
#include "environment/NewsGenerator.hpp"
#include "environment/MacroEnvironment.hpp"
#include <memory>
#include <vector>
#include <map>
#include <deque>
#include <functional>

namespace market {

    class MarketEngine {
    public:
        MarketEngine();

        // RuntimeConfig injection
        void setRuntimeConfig(const RuntimeConfig* cfg) { rtConfig_ = cfg; macroEnv_.setRuntimeConfig(cfg); }
        const RuntimeConfig* getRuntimeConfig() const { return rtConfig_; }

        // Asset management
        void addAsset(std::unique_ptr<Asset> asset);
        Asset* getAsset(const std::string& symbol);
        const std::map<std::string, std::unique_ptr<Asset>>& getAssets() const { return assets_; }
        std::map<std::string, std::unique_ptr<Asset>>& getMutableAssets() { return assets_; }

        // Agent management
        void addAgent(std::unique_ptr<Agent> agent);
        void addAgents(std::vector<std::unique_ptr<Agent>> agents);
        const std::vector<std::unique_ptr<Agent>>& getAgents() const { return agents_; }
        std::vector<std::unique_ptr<Agent>>& getMutableAgents() { return agents_; }
        std::map<std::string, std::unique_ptr<OrderBook>>& getOrderBooks() { return orderBooks_; }

        // Order book access
        OrderBook* getOrderBook(const std::string& symbol);

        // Environment access
        NewsGenerator& getNewsGenerator() { return newsGenerator_; }
        const NewsGenerator& getNewsGenerator() const { return newsGenerator_; }
        MacroEnvironment& getMacroEnvironment() { return macroEnv_; }
        const MacroEnvironment& getMacroEnvironment() const { return macroEnv_; }
        SimClock& getSimClock() { return simClock_; }
        const SimClock& getSimClock() const { return simClock_; }
        CandleAggregator& getCandleAggregator() { return candleAggregator_; }
        const CandleAggregator& getCandleAggregator() const { return candleAggregator_; }

        // Process one simulation tick
        void tick();

        // Get current market state (for agents)
        MarketState getMarketState() const;

        // Get order book snapshots
        std::map<std::string, OrderBookSnapshot> getOrderBookSnapshots(int depth = 5) const;

        // Get simulation metrics
        SimulationMetrics getMetrics() const;

        // Trade log (most recent trades)
        const std::deque<Trade>& getRecentTrades() const { return recentTrades_; }

        // Per-agent-type stats
        const std::map<std::string, AgentTypeStats>& getAgentTypeStats() const { return agentTypeStats_; }

        // Reset simulation
        void reset();

        // Callbacks for logging
        using TradeCallback = std::function<void(const Trade&)>;
        using NewsCallback = std::function<void(const NewsEvent&)>;

        void setTradeCallback(TradeCallback cb) { tradeCallback_ = cb; }
        void setNewsCallback(NewsCallback cb) { newsCallback_ = cb; }

    private:
        const RuntimeConfig* rtConfig_ = nullptr;

        std::map<std::string, std::unique_ptr<Asset>> assets_;
        std::map<std::string, std::unique_ptr<OrderBook>> orderBooks_;
        std::vector<std::unique_ptr<Agent>> agents_;

        NewsGenerator newsGenerator_;
        MacroEnvironment macroEnv_;
        SimClock simClock_;
        CandleAggregator candleAggregator_;

        // Recent news for agent observation
        std::vector<NewsEvent> recentNews_;
        static constexpr size_t MAX_RECENT_NEWS = 20;

        // Industry tracking
        std::map<std::string, std::vector<std::string>> industryToSymbols_;
        std::map<std::string, double> industryShocks_;

        // Company-level shocks from COMPANY news (feeds into updateFundamentals)
        std::map<std::string, double> companyShocks_;

        // Metrics
        uint64_t totalTicks_ = 0;
        uint64_t totalTrades_ = 0;
        uint64_t totalOrders_ = 0;

        // Diagnostics: trade log ring buffer
        std::deque<Trade> recentTrades_;
        static constexpr size_t MAX_RECENT_TRADES = 1000;

        // Diagnostics: per-agent-type stats
        std::map<std::string, AgentTypeStats> agentTypeStats_;

        // Lookup: agentId → type string (populated when agents are added)
        std::map<AgentId, std::string> agentIdToType_;

        // Callbacks
        TradeCallback tradeCallback_;
        NewsCallback newsCallback_;

        // Process news and update fundamentals
        void processNews(const std::vector<NewsEvent>& news);

        // Update asset fundamentals
        void updateFundamentals(double tickScale = 1.0);

        // Collect and process agent orders
        void processAgentOrders();

        // Match orders across all order books
        void matchAllOrders();

        // Update asset prices from trades
        void updatePrices(const std::vector<Trade>& trades);

        // Notify agents of trades
        void notifyAgentsOfTrades(const std::vector<Trade>& trades);
    };

} // namespace market
