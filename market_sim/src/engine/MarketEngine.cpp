#include "MarketEngine.hpp"
#include "utils/Logger.hpp"
#include "utils/Random.hpp"
#include <algorithm>
#include <cmath>

namespace market {

    MarketEngine::MarketEngine() {}

    void MarketEngine::addCommodity(std::unique_ptr<Commodity> commodity) {
        const std::string& symbol = commodity->getSymbol();

        orderBooks_[symbol] = std::make_unique<OrderBook>(symbol);
        orderBooks_[symbol]->setSimClock(&simClock_);
        if (rtConfig_) {
            orderBooks_[symbol]->setMaxOrderAgeMs(rtConfig_->orderBook.orderExpiryMs);
        }

        candleAggregator_.addSymbol(symbol);

        newsGenerator_.setCommodities([&]() {
            std::vector<std::string> syms;
            for (const auto& [s, _] : commodities_) {
                syms.push_back(s);
            }
            syms.push_back(symbol);
            return syms;
        }());

        std::map<std::string, std::string> names;
        for (const auto& [s, c] : commodities_) {
            names[s] = c->getName();
        }
        names[symbol] = commodity->getName();
        newsGenerator_.setCommodityNames(names);

        std::map<std::string, std::string> categories;
        for (const auto& [s, c] : commodities_) {
            categories[s] = c->getCategory();
        }
        categories[symbol] = commodity->getCategory();
        newsGenerator_.setCommodityCategories(categories);

        commodities_[symbol] = std::move(commodity);

        Logger::info("Added commodity {} ({})", symbol, categories[symbol]);
    }

    Commodity* MarketEngine::getCommodity(const std::string& symbol) {
        auto it = commodities_.find(symbol);
        return it != commodities_.end() ? it->second.get() : nullptr;
    }

    void MarketEngine::addAgent(std::unique_ptr<Agent> agent) {
        agentIdToType_[agent->getId()] = agent->getType();
        agents_.push_back(std::move(agent));
    }

    void MarketEngine::addAgents(std::vector<std::unique_ptr<Agent>> newAgents) {
        for (auto& agent : newAgents) {
            agentIdToType_[agent->getId()] = agent->getType();
            agents_.push_back(std::move(agent));
        }
        Logger::info("Added {} agents, total: {}", newAgents.size(), agents_.size());
    }

    OrderBook* MarketEngine::getOrderBook(const std::string& symbol) {
        auto it = orderBooks_.find(symbol);
        return it != orderBooks_.end() ? it->second.get() : nullptr;
    }

    void MarketEngine::setCrossEffects(const std::string& symbol, const std::vector<CrossEffect>& effects) {
        crossEffects_[symbol] = effects;
    }

    void MarketEngine::tick() {
        totalTicks_++;

        simClock_.tick();
        Timestamp simTime = simClock_.currentTimestamp();

        if (simClock_.isNewDay()) {
            for (auto& [symbol, commodity] : commodities_) {
                commodity->resetCircuitBreaker();
                commodity->markDayOpen();
                commodity->resetDailyVolume();
            }
        }

        double tickScale = simClock_.getTickScale();
        auto news = newsGenerator_.generate(simTime, tickScale);
        processNews(news);

        for (auto& agent : agents_) {
            agent->decaySentiment(tickScale);
        }

        decaySentiment(tickScale);

        updateSupplyDemand(tickScale);

        processAgentOrders();

        matchAllOrders();

        for (const auto& [symbol, commodity] : commodities_) {
            double vol = commodity->getDailyVolume();
            candleAggregator_.onTick(symbol, commodity->getPrice(), vol, simTime);
        }

        if (totalTicks_ % 1000 == 0) {
            Logger::info("Tick {} ({}): {} trades, {} orders",
                totalTicks_, simClock_.currentDateString(), totalTrades_, totalOrders_);
        }
    }

    void MarketEngine::processNews(const std::vector<NewsEvent>& news) {
        for (const auto& event : news) {
            recentNews_.push_back(event);
            if (recentNews_.size() > MAX_RECENT_NEWS) {
                recentNews_.erase(recentNews_.begin());
            }

            Logger::debug("[NEWS] {}: {} (mag: {:.3f})",
                event.category == NewsCategory::SUPPLY ? "SUPPLY" :
                event.category == NewsCategory::DEMAND ? "DEMAND" :
                event.category == NewsCategory::GLOBAL ? "GLOBAL" : "POLITICAL",
                event.headline, event.magnitude);

            double sign = (event.sentiment == NewsSentiment::POSITIVE) ? 1.0 :
                          (event.sentiment == NewsSentiment::NEGATIVE) ? -1.0 : 0.0;

            if (event.category == NewsCategory::GLOBAL || event.category == NewsCategory::POLITICAL) {
                globalSentiment_ += sign * event.magnitude * 0.3;
            }
            else if (event.category == NewsCategory::SUPPLY) {
                auto* commodity = getCommodity(event.symbol);
                if (commodity) {
                    commodity->applySupplyShock(-sign * event.magnitude);
                }
            }
            else if (event.category == NewsCategory::DEMAND) {
                auto* commodity = getCommodity(event.symbol);
                if (commodity) {
                    commodity->applyDemandShock(sign * event.magnitude);
                }
            }

            for (auto& agent : agents_) {
                agent->updateBeliefs(event);
            }

            if (newsCallback_) {
                newsCallback_(event);
            }

            newsGenerator_.addToRecent(event);
        }
    }

    void MarketEngine::updateSupplyDemand(double tickScale) {
        for (auto& [symbol, commodity] : commodities_) {
            commodity->updateSupplyDemand(tickScale);
        }
    }

    void MarketEngine::decaySentiment(double tickScale) {
        globalSentiment_ *= std::pow(0.95, tickScale);
    }

    MarketState MarketEngine::getMarketState() const {
        MarketState state;
        state.currentTime = simClock_.currentTimestamp();
        state.globalSentiment = globalSentiment_;
        state.tickScale = simClock_.getTickScale();
        state.recentNews = recentNews_;

        for (const auto& [symbol, commodity] : commodities_) {
            state.prices[symbol] = commodity->getPrice();
            state.supplyDemand[symbol] = commodity->getSupplyDemand();
            state.priceHistory[symbol] = commodity->getPriceHistory();
            state.volumes[symbol] = commodity->getDailyVolume();
            state.symbolToCategory[symbol] = commodity->getCategory();
        }

        for (const auto& [symbol, effects] : crossEffects_) {
            state.crossEffects[symbol] = effects;
        }

        return state;
    }

    void MarketEngine::processAgentOrders() {
        MarketState state = getMarketState();

        for (auto& agent : agents_) {
            auto orderOpt = agent->decide(state);

            if (orderOpt.has_value()) {
                Order& order = orderOpt.value();

                auto* book = getOrderBook(order.symbol);
                if (book) {
                    book->addOrder(order);
                    totalOrders_++;

                    auto& stats = agentTypeStats_[agent->getType()];
                    stats.ordersPlaced++;
                    if (order.side == OrderSide::BUY)
                        stats.buyOrders++;
                    else
                        stats.sellOrders++;
                }
            }
        }
    }

    void MarketEngine::matchAllOrders() {
        std::vector<Trade> allTrades;

        for (auto& [symbol, book] : orderBooks_) {
            auto trades = book->matchOrders();

            for (auto& trade : trades) {
                auto bit = agentIdToType_.find(trade.buyerId);
                trade.buyerType = (bit != agentIdToType_.end()) ? bit->second : "User";
                auto sit = agentIdToType_.find(trade.sellerId);
                trade.sellerType = (sit != agentIdToType_.end()) ? sit->second : "User";

                recentTrades_.push_back(trade);
                if (recentTrades_.size() > MAX_RECENT_TRADES) {
                    recentTrades_.pop_front();
                }

                agentTypeStats_[trade.buyerType].fills++;
                agentTypeStats_[trade.buyerType].volumeTraded += trade.quantity;
                agentTypeStats_[trade.buyerType].cashSpent += trade.price * trade.quantity;
                agentTypeStats_[trade.sellerType].fills++;
                agentTypeStats_[trade.sellerType].volumeTraded += trade.quantity;
                agentTypeStats_[trade.sellerType].cashReceived += trade.price * trade.quantity;

                allTrades.push_back(trade);
                totalTrades_++;

                if (tradeCallback_) {
                    tradeCallback_(trade);
                }
            }
        }

        updatePrices(allTrades);
        notifyAgentsOfTrades(allTrades);
    }

    void MarketEngine::updatePrices(const std::vector<Trade>& trades) {
        for (const auto& trade : trades) {
            auto* commodity = getCommodity(trade.symbol);
            if (commodity) {
                commodity->applyTradePrice(trade.price, trade.quantity);
                commodity->addVolume(trade.quantity);
            }
        }
    }

    void MarketEngine::notifyAgentsOfTrades(const std::vector<Trade>& trades) {
        for (const auto& trade : trades) {
            for (auto& agent : agents_) {
                if (agent->getId() == trade.buyerId || agent->getId() == trade.sellerId) {
                    agent->onFill(trade);
                }
            }
        }
    }

    std::map<std::string, OrderBookSnapshot> MarketEngine::getOrderBookSnapshots(int depth) const {
        std::map<std::string, OrderBookSnapshot> snapshots;
        for (const auto& [symbol, book] : orderBooks_) {
            snapshots[symbol] = book->getSnapshot(depth);
        }
        return snapshots;
    }

    SimulationMetrics MarketEngine::getMetrics() const {
        SimulationMetrics metrics;
        metrics.totalTicks = totalTicks_;
        metrics.totalTrades = totalTrades_;
        metrics.totalOrders = totalOrders_;

        double sumSpread = 0;
        int count = 0;
        for (const auto& [symbol, book] : orderBooks_) {
            double spread = book->getSpread();
            if (spread > 0) {
                sumSpread += spread;
                count++;
            }
        }
        metrics.avgSpread = count > 0 ? sumSpread / count : 0;

        for (const auto& [symbol, commodity] : commodities_) {
            metrics.returns[symbol] = commodity->getReturn(1);
        }

        metrics.agentTypeStats = agentTypeStats_;

        return metrics;
    }

    void MarketEngine::reset() {
        totalTicks_ = 0;
        totalTrades_ = 0;
        totalOrders_ = 0;
        recentNews_.clear();
        globalSentiment_ = 0.0;

        recentTrades_.clear();
        agentTypeStats_.clear();
        agentIdToType_.clear();

        agents_.clear();
        commodities_.clear();
        orderBooks_.clear();
        crossEffects_.clear();
        candleAggregator_ = CandleAggregator();

        Logger::info("Market engine reset");
    }

} // namespace market
