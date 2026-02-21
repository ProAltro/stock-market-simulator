#include "Agent.hpp"
#include "SupplyDemandTrader.hpp"
#include "MomentumTrader.hpp"
#include "MeanReversionTrader.hpp"
#include "NoiseTrader.hpp"
#include "MarketMaker.hpp"
#include "CrossEffectsTrader.hpp"
#include "InventoryTrader.hpp"
#include "EventTrader.hpp"
#include "utils/Random.hpp"
#include <algorithm>
#include <cmath>

namespace market {

    Agent::Agent(AgentId id, double initialCash, const AgentParams& params,
        const RuntimeConfig* rtConfig)
        : id_(id)
        , cash_(initialCash)
        , initialCash_(initialCash)
        , params_(params)
        , rtConfig_(rtConfig)
    {
        if (rtConfig_) {
            maxShortPosition_ = rtConfig_->agentGlobal.maxShortPosition;
        }
    }

    void Agent::onFill(const Trade& trade) {
        bool isBuyer = (trade.buyerId == id_);

        double cost = trade.price * trade.quantity;

        if (isBuyer) {
            cash_ -= cost;
            auto& pos = portfolio_[trade.symbol];
            double totalCost = pos.avgCost * pos.quantity + cost;
            pos.quantity += trade.quantity;
            pos.avgCost = pos.quantity > 0 ? totalCost / pos.quantity : 0;
            pos.symbol = trade.symbol;
        }
        else {
            cash_ += cost;
            auto& pos = portfolio_[trade.symbol];
            pos.quantity -= trade.quantity;
            if (pos.quantity == 0) {
                portfolio_.erase(trade.symbol);
            }
        }
    }

    void Agent::updateBeliefs(const NewsEvent& news) {
        double impact = news.magnitude * params_.newsWeight;
        double sign = 0.0;

        switch (news.sentiment) {
        case NewsSentiment::POSITIVE: sign = 1.0; break;
        case NewsSentiment::NEGATIVE: sign = -1.0; break;
        default: sign = 0.0; break;
        }

        double signedImpact = impact * sign;

        switch (news.category) {
        case NewsCategory::GLOBAL:
        case NewsCategory::POLITICAL:
            sentimentBias_ += signedImpact;
            break;

        case NewsCategory::SUPPLY:
            if (!news.symbol.empty()) {
                commoditySentiment_[news.symbol] += signedImpact;
            }
            sentimentBias_ += signedImpact * 0.2;
            break;

        case NewsCategory::DEMAND:
            if (!news.symbol.empty()) {
                commoditySentiment_[news.symbol] += signedImpact;
            }
            sentimentBias_ += signedImpact * 0.2;
            break;
        }
    }

    void Agent::decaySentiment(double tickScale) {
        double dg = rtConfig_ ? rtConfig_->agentGlobal.sentimentDecayGlobal : 0.95;
        double dc = rtConfig_ ? rtConfig_->agentGlobal.sentimentDecayCommodity : 0.90;

        sentimentBias_ *= std::pow(dg, tickScale);
        for (auto& [_, val] : commoditySentiment_) { val *= std::pow(dc, tickScale); }
    }

    double Agent::getCombinedSentiment(const std::string& symbol) const {
        double combined = sentimentBias_ * 0.4;

        auto it = commoditySentiment_.find(symbol);
        if (it != commoditySentiment_.end()) {
            combined += it->second;
        }

        return combined;
    }

    Volume Agent::getPosition(const std::string& symbol) const {
        auto it = portfolio_.find(symbol);
        return (it != portfolio_.end()) ? it->second.quantity : 0;
    }

    double Agent::getPortfolioValue(const std::map<std::string, Price>& prices) const {
        double value = 0.0;
        for (const auto& [symbol, pos] : portfolio_) {
            auto priceIt = prices.find(symbol);
            if (priceIt != prices.end()) {
                value += pos.quantity * priceIt->second;
            }
        }
        return value;
    }

    double Agent::getTotalValue(const std::map<std::string, Price>& prices) const {
        return cash_ + getPortfolioValue(prices);
    }

    bool Agent::canBuy(const std::string& symbol, Volume quantity, Price price) const {
        double cost = price * quantity;
        double reserveFrac = rtConfig_ ? rtConfig_->agentGlobal.cashReserve : 0.10;
        double reserve = initialCash_ * reserveFrac;
        return cash_ >= (cost + reserve);
    }

    bool Agent::canSell(const std::string& symbol, Volume quantity) const {
        return getPosition(symbol) >= quantity;
    }

    void Agent::seedInventory(const std::string& symbol, Volume quantity, Price price) {
        auto& pos = portfolio_[symbol];
        pos.symbol = symbol;
        pos.quantity += quantity;
        pos.avgCost = price;
    }

    Order Agent::createOrder(const std::string& symbol,
        OrderSide side,
        OrderType type,
        Price price,
        Volume quantity) const {
        Order order;
        order.id = 0;
        order.agentId = id_;
        order.symbol = symbol;
        order.side = side;
        order.type = type;
        order.price = price;
        order.quantity = quantity;
        order.timestamp = now();
        return order;
    }

    Volume Agent::calculateOrderSize(Price price, double confidence) const {
        if (price <= 0 || cash_ <= 0) return 0;

        double capFrac = rtConfig_ ? rtConfig_->agentGlobal.capitalFraction : 0.05;
        int    maxSize = rtConfig_ ? rtConfig_->agentGlobal.maxOrderSize : 500;

        double capitalFraction = capFrac / params_.riskAversion;
        double sizeFactor = capitalFraction * confidence;

        double maxSpend = cash_ * std::min(sizeFactor, 0.05);
        Volume size = static_cast<Volume>(maxSpend / price);

        size = std::min(size, static_cast<Volume>(maxSize));

        return std::max(Volume(1), size);
    }

    AgentParams AgentFactory::generateParams(const RuntimeConfig* cfg) {
        double raMean = cfg ? cfg->agentGen.riskAversionMean : 1.0;
        double raStd = cfg ? cfg->agentGen.riskAversionStd : 0.3;
        double raMin = cfg ? cfg->agentGen.riskAversionMin : 0.1;
        double rsLam = cfg ? cfg->agentGen.reactionSpeedLambda : 1.0;
        double nwMin = cfg ? cfg->agentGen.newsWeightMin : 0.5;
        double nwMax = cfg ? cfg->agentGen.newsWeightMax : 1.5;
        double cMin = cfg ? cfg->agentGen.confidenceMin : 0.3;
        double cMax = cfg ? cfg->agentGen.confidenceMax : 1.0;
        double thMu = cfg ? cfg->agentGen.timeHorizonMu : 3.0;
        double thSig = cfg ? cfg->agentGen.timeHorizonSigma : 0.5;

        AgentParams params;
        params.riskAversion = Random::normal(raMean, raStd);
        params.riskAversion = std::max(raMin, params.riskAversion);
        params.reactionSpeed = Random::exponential(rsLam);
        params.newsWeight = Random::uniform(nwMin, nwMax);
        params.confidenceLevel = Random::uniform(cMin, cMax);
        params.timeHorizon = static_cast<int>(Random::logNormal(thMu, thSig));
        return params;
    }

    std::unique_ptr<Agent> AgentFactory::createSupplyDemandTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<SupplyDemandTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createMomentumTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<MomentumTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createMeanReversionTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<MeanReversionTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createNoiseTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<NoiseTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createMarketMaker(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<MarketMaker>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createCrossEffectsTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<CrossEffectsTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createInventoryTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<InventoryTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::unique_ptr<Agent> AgentFactory::createEventTrader(AgentId id, double cash, const RuntimeConfig* cfg) {
        return std::make_unique<EventTrader>(id, cash, generateParams(cfg), cfg);
    }

    std::vector<std::unique_ptr<Agent>> AgentFactory::createPopulation(
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
        const RuntimeConfig* cfg
    ) {
        std::vector<std::unique_ptr<Agent>> agents;
        AgentId nextId = 1;

        auto getCash = [&]() {
            return std::max(1000.0, Random::normal(meanCash, stdCash));
            };

        for (int i = 0; i < numSupplyDemand; ++i) {
            agents.push_back(createSupplyDemandTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numMomentum; ++i) {
            agents.push_back(createMomentumTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numMeanReversion; ++i) {
            agents.push_back(createMeanReversionTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numNoise; ++i) {
            agents.push_back(createNoiseTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numMarketMakers; ++i) {
            agents.push_back(createMarketMaker(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numCrossEffects; ++i) {
            agents.push_back(createCrossEffectsTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numInventory; ++i) {
            agents.push_back(createInventoryTrader(nextId++, getCash(), cfg));
        }

        for (int i = 0; i < numEvent; ++i) {
            agents.push_back(createEventTrader(nextId++, getCash(), cfg));
        }

        return agents;
    }

} // namespace market
