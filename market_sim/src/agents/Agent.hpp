#pragma once

#include "core/Types.hpp"
#include "core/RuntimeConfig.hpp"
#include <memory>
#include <optional>
#include <string>
#include <map>

namespace market {

    class Agent {
    public:
        Agent(AgentId id, double initialCash, const AgentParams& params,
            const RuntimeConfig* rtConfig = nullptr);
        virtual ~Agent() = default;

        // Pure virtual: each agent type implements its own strategy
        virtual std::optional<Order> decide(const MarketState& state) = 0;

        // Called when an order is filled
        virtual void onFill(const Trade& trade);

        // Update beliefs based on news (category-aware)
        virtual void updateBeliefs(const NewsEvent& news);

        // Decay all sentiment once per tick (called from MarketEngine)
        virtual void decaySentiment();

        // Agent type identifier
        virtual std::string getType() const = 0;

        // Getters
        AgentId getId() const { return id_; }
        double getCash() const { return cash_; }
        const std::map<std::string, Position>& getPortfolio() const { return portfolio_; }
        const AgentParams& getParams() const { return params_; }

        // Sentiment getters (for diagnostics API)
        double getSentimentBias() const { return sentimentBias_; }
        const std::map<std::string, double>& getIndustrySentiment() const { return industrySentiment_; }
        const std::map<std::string, double>& getSymbolSentiment() const { return symbolSentiment_; }

        // Portfolio management
        Volume getPosition(const std::string& symbol) const;
        double getPortfolioValue(const std::map<std::string, Price>& prices) const;
        double getTotalValue(const std::map<std::string, Price>& prices) const;

        // Risk management
        bool canBuy(const std::string& symbol, Volume quantity, Price price) const;
        bool canSell(const std::string& symbol, Volume quantity) const;

        // Seed initial inventory (for market makers at init time)
        void seedInventory(const std::string& symbol, Volume quantity, Price price);

    protected:
        AgentId id_;
        double cash_;
        double initialCash_;
        std::map<std::string, Position> portfolio_;
        AgentParams params_;
        const RuntimeConfig* rtConfig_ = nullptr;

        // Multi-level sentiment tracking
        double sentimentBias_ = 0.0;          // Global/political sentiment
        std::map<std::string, double> industrySentiment_;  // Per-industry
        std::map<std::string, double> symbolSentiment_;    // Per-company

        // Get combined sentiment for a specific symbol
        double getCombinedSentiment(const std::string& symbol, const std::string& industry) const;

        // Helper to create order
        Order createOrder(const std::string& symbol,
            OrderSide side,
            OrderType type,
            Price price,
            Volume quantity) const;

        // Calculate order size based on capital and risk
        Volume calculateOrderSize(Price price, double confidence) const;
    };

    // Factory for creating agents with random parameters
    class AgentFactory {
    public:
        static std::unique_ptr<Agent> createFundamentalTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMomentumTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMeanReversionTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createNoiseTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMarketMaker(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);

        // Create agent population based on config
        static std::vector<std::unique_ptr<Agent>> createPopulation(
            int numFundamental,
            int numMomentum,
            int numMeanReversion,
            int numNoise,
            int numMarketMakers,
            double meanCash,
            double stdCash,
            const RuntimeConfig* cfg = nullptr
        );

    private:
        static AgentParams generateParams(const RuntimeConfig* cfg = nullptr);
    };

} // namespace market
