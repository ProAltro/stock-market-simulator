#pragma once

#include "core/Types.hpp"
#include "core/Commodity.hpp"
#include "core/OrderBook.hpp"
#include "core/SimClock.hpp"
#include "core/CandleAggregator.hpp"
#include "core/RuntimeConfig.hpp"
#include "agents/Agent.hpp"
#include "environment/NewsGenerator.hpp"
#include <memory>
#include <vector>
#include <map>
#include <deque>
#include <functional>

namespace market {

    class MarketEngine {
    public:
        MarketEngine();

        void setRuntimeConfig(const RuntimeConfig* cfg) { rtConfig_ = cfg; }
        const RuntimeConfig* getRuntimeConfig() const { return rtConfig_; }

        void addCommodity(std::unique_ptr<Commodity> commodity);
        Commodity* getCommodity(const std::string& symbol);
        const std::map<std::string, std::unique_ptr<Commodity>>& getCommodities() const { return commodities_; }
        std::map<std::string, std::unique_ptr<Commodity>>& getMutableCommodities() { return commodities_; }

        void addAgent(std::unique_ptr<Agent> agent);
        void addAgents(std::vector<std::unique_ptr<Agent>> agents);
        const std::vector<std::unique_ptr<Agent>>& getAgents() const { return agents_; }
        std::vector<std::unique_ptr<Agent>>& getMutableAgents() { return agents_; }
        std::map<std::string, std::unique_ptr<OrderBook>>& getOrderBooks() { return orderBooks_; }

        OrderBook* getOrderBook(const std::string& symbol);

        NewsGenerator& getNewsGenerator() { return newsGenerator_; }
        const NewsGenerator& getNewsGenerator() const { return newsGenerator_; }
        SimClock& getSimClock() { return simClock_; }
        const SimClock& getSimClock() const { return simClock_; }
        CandleAggregator& getCandleAggregator() { return candleAggregator_; }
        const CandleAggregator& getCandleAggregator() const { return candleAggregator_; }

        void tick();

        MarketState getMarketState() const;

        std::map<std::string, OrderBookSnapshot> getOrderBookSnapshots(int depth = 5) const;

        SimulationMetrics getMetrics() const;

        const std::deque<Trade>& getRecentTrades() const { return recentTrades_; }

        const std::map<std::string, AgentTypeStats>& getAgentTypeStats() const { return agentTypeStats_; }

        void reset();

        using TradeCallback = std::function<void(const Trade&)>;
        using NewsCallback = std::function<void(const NewsEvent&)>;

        void setTradeCallback(TradeCallback cb) { tradeCallback_ = cb; }
        void setNewsCallback(NewsCallback cb) { newsCallback_ = cb; }

        void setCrossEffects(const std::string& symbol, const std::vector<CrossEffect>& effects);

    private:
        const RuntimeConfig* rtConfig_ = nullptr;

        std::map<std::string, std::unique_ptr<Commodity>> commodities_;
        std::map<std::string, std::unique_ptr<OrderBook>> orderBooks_;
        std::vector<std::unique_ptr<Agent>> agents_;

        NewsGenerator newsGenerator_;
        SimClock simClock_;
        CandleAggregator candleAggregator_;

        std::vector<NewsEvent> recentNews_;
        static constexpr size_t MAX_RECENT_NEWS = 20;

        std::map<std::string, std::vector<CrossEffect>> crossEffects_;

        double globalSentiment_ = 0.0;

        uint64_t totalTicks_ = 0;
        uint64_t totalTrades_ = 0;
        uint64_t totalOrders_ = 0;

        std::deque<Trade> recentTrades_;
        static constexpr size_t MAX_RECENT_TRADES = 1000;

        std::map<std::string, AgentTypeStats> agentTypeStats_;

        std::map<AgentId, std::string> agentIdToType_;

        TradeCallback tradeCallback_;
        NewsCallback newsCallback_;

        void processNews(const std::vector<NewsEvent>& news);

        void updateSupplyDemand(double tickScale);

        void processAgentOrders();

        void matchAllOrders();

        void updatePrices(const std::vector<Trade>& trades);

        void notifyAgentsOfTrades(const std::vector<Trade>& trades);

        void decaySentiment(double tickScale);
    };

} // namespace market
