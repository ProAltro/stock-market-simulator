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

        virtual std::optional<Order> decide(const MarketState& state) = 0;

        virtual void onFill(const Trade& trade);

        virtual void updateBeliefs(const NewsEvent& news);

        virtual void decaySentiment(double tickScale = 1.0);

        virtual std::string getType() const = 0;

        AgentId getId() const { return id_; }
        double getCash() const { return cash_; }
        const std::map<std::string, Position>& getPortfolio() const { return portfolio_; }
        const AgentParams& getParams() const { return params_; }

        double getSentimentBias() const { return sentimentBias_; }
        const std::map<std::string, double>& getCommoditySentiment() const { return commoditySentiment_; }

        Volume getPosition(const std::string& symbol) const;
        double getPortfolioValue(const std::map<std::string, Price>& prices) const;
        double getTotalValue(const std::map<std::string, Price>& prices) const;

        bool canBuy(const std::string& symbol, Volume quantity, Price price) const;
        bool canSell(const std::string& symbol, Volume quantity) const;

        void seedInventory(const std::string& symbol, Volume quantity, Price price);

    protected:
        AgentId id_;
        double cash_;
        double initialCash_;
        std::map<std::string, Position> portfolio_;
        AgentParams params_;
        const RuntimeConfig* rtConfig_ = nullptr;

        double sentimentBias_ = 0.0;
        std::map<std::string, double> commoditySentiment_;
        int maxShortPosition_ = 20;

        double getCombinedSentiment(const std::string& symbol) const;

        // Maximum volume an agent may sell for a given symbol, allowing
        // bounded short-selling up to maxShortPosition_ units beyond zero.
        Volume getMaxSellable(const std::string& symbol) const {
            return getPosition(symbol) + static_cast<Volume>(maxShortPosition_);
        }

        Order createOrder(const std::string& symbol,
            OrderSide side,
            OrderType type,
            Price price,
            Volume quantity) const;

        Volume calculateOrderSize(Price price, double confidence) const;
    };

    class AgentFactory {
    public:
        static std::unique_ptr<Agent> createSupplyDemandTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMomentumTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMeanReversionTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createNoiseTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createMarketMaker(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createCrossEffectsTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createInventoryTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);
        static std::unique_ptr<Agent> createEventTrader(AgentId id, double cash, const RuntimeConfig* cfg = nullptr);

        static std::vector<std::unique_ptr<Agent>> createPopulation(
            int numSupplyDemand,
            int numMomentum,
            int numMeanReversion,
            int numNoise,
            int numMarketMakers,
            int numCrossEffects,
            int numInventory,
            int numEvent,
            double meanCash,
            double stdCash,
            const RuntimeConfig* cfg = nullptr
        );

    private:
        static AgentParams generateParams(const RuntimeConfig* cfg = nullptr);
    };

} // namespace market
