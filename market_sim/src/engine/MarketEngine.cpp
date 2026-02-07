#include "MarketEngine.hpp"
#include "utils/Logger.hpp"
#include "utils/Random.hpp"
#include <algorithm>

namespace market {

    MarketEngine::MarketEngine() {}

    void MarketEngine::addAsset(std::unique_ptr<Asset> asset) {
        const std::string& symbol = asset->getSymbol();
        const std::string& industry = asset->getIndustry();

        // Track industry
        industryToSymbols_[industry].push_back(symbol);

        // Create order book
        orderBooks_[symbol] = std::make_unique<OrderBook>(symbol);
        orderBooks_[symbol]->setSimClock(&simClock_);
        if (rtConfig_) {
            orderBooks_[symbol]->setMaxOrderAgeMs(rtConfig_->orderBook.orderExpiryMs);
        }

        // Register with candle aggregator
        candleAggregator_.addSymbol(symbol);

        // Update news generator
        std::map<std::string, std::string> symbolToIndustry;
        std::map<std::string, std::string> symbolToName;
        std::map<std::string, double> symbolToMarketCap;
        std::map<std::string, std::string> symbolToSector;
        for (const auto& [sym, assetPtr] : assets_) {
            symbolToIndustry[sym] = assetPtr->getIndustry();
            symbolToName[sym] = assetPtr->getName();
            symbolToMarketCap[sym] = assetPtr->getMarketCap();
            symbolToSector[sym] = assetPtr->getSectorDetail();
        }
        symbolToIndustry[symbol] = industry;
        symbolToName[symbol] = asset->getName();
        symbolToMarketCap[symbol] = asset->getMarketCap();
        symbolToSector[symbol] = asset->getSectorDetail();

        newsGenerator_.setSymbols(symbolToIndustry);
        newsGenerator_.setSymbolNames(symbolToName);
        newsGenerator_.setSymbolMarketCaps(symbolToMarketCap);
        newsGenerator_.setSymbolSectorDetails(symbolToSector);

        std::vector<std::string> industries;
        for (const auto& [ind, _] : industryToSymbols_) {
            industries.push_back(ind);
        }
        newsGenerator_.setIndustries(industries);

        assets_[symbol] = std::move(asset);

        Logger::info("Added asset {} ({})", symbol, industry);
    }

    Asset* MarketEngine::getAsset(const std::string& symbol) {
        auto it = assets_.find(symbol);
        return it != assets_.end() ? it->second.get() : nullptr;
    }

    void MarketEngine::addAgent(std::unique_ptr<Agent> agent) {
        Logger::debug("Added agent {} ({})", agent->getId(), agent->getType());
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

    void MarketEngine::tick() {
        totalTicks_++;

        // 0. Advance simulated clock
        simClock_.tick();
        Timestamp simTime = simClock_.currentTimestamp();

        // 0a. Handle new day: reset circuit breakers, mark day open prices, reset daily volume
        if (simClock_.isNewDay()) {
            for (auto& [symbol, asset] : assets_) {
                asset->resetCircuitBreaker();
                asset->markDayOpen();
                asset->resetDailyVolume();
            }
        }

        // 1. Generate and process news
        auto news = newsGenerator_.generate(simTime);
        processNews(news);

        // 2. Decay agent sentiments (once per tick, not per news event)
        for (auto& agent : agents_) {
            agent->decaySentiment();
        }

        // 3. Update macro environment
        macroEnv_.update();

        // 4. Update fundamental values
        updateFundamentals();

        // 5. Collect and process agent orders
        processAgentOrders();

        // 6. Match orders (skip for circuit-broken symbols)
        matchAllOrders();

        // 7. Feed latest prices to candle aggregator
        for (const auto& [symbol, asset] : assets_) {
            double vol = asset->getDailyVolume();  // incremental since last
            candleAggregator_.onTick(symbol, asset->getPrice(), vol, simTime);
        }

        // Log periodic status
        if (totalTicks_ % 100 == 0) {
            Logger::info("Tick {} ({}): {} trades, {} agents active",
                totalTicks_, simClock_.currentDateString(), totalTrades_, agents_.size());

            for (const auto& [symbol, asset] : assets_) {
                Logger::debug("  {}: price={:.2f}, fundamental={:.2f}, volume={}",
                    symbol, asset->getPrice(), asset->getFundamentalValue(),
                    asset->getDailyVolume());
            }
        }
    }

    MarketState MarketEngine::getMarketState() const {
        MarketState state;
        state.currentTime = simClock_.currentTimestamp();
        state.globalSentiment = macroEnv_.getGlobalSentiment();
        state.interestRate = macroEnv_.getInterestRate();
        state.recentNews = recentNews_;

        for (const auto& [symbol, asset] : assets_) {
            state.prices[symbol] = asset->getPrice();
            state.fundamentals[symbol] = asset->getFundamentalValue();
            state.volumes[symbol] = asset->getDailyVolume();
            state.priceHistory[symbol] = asset->getPriceHistory();
            state.symbolToIndustry[symbol] = asset->getIndustry();
        }

        return state;
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

        // Calculate average spread
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

        // Calculate returns
        for (const auto& [symbol, asset] : assets_) {
            metrics.returns[symbol] = asset->getReturn(1);
        }

        // Include per-agent-type stats
        metrics.agentTypeStats = agentTypeStats_;

        return metrics;
    }

    void MarketEngine::reset() {
        totalTicks_ = 0;
        totalTrades_ = 0;
        totalOrders_ = 0;
        recentNews_.clear();
        industryShocks_.clear();
        companyShocks_.clear();

        // Clear diagnostics
        recentTrades_.clear();
        agentTypeStats_.clear();
        agentIdToType_.clear();

        // Clear ALL state so reinitialize() starts fresh
        agents_.clear();
        assets_.clear();
        orderBooks_.clear();
        industryToSymbols_.clear();
        candleAggregator_ = CandleAggregator();

        Logger::info("Market engine reset (agents, assets, order books, diagnostics cleared)");
    }

    void MarketEngine::processNews(const std::vector<NewsEvent>& news) {
        for (const auto& event : news) {
            // Add to recent news
            recentNews_.push_back(event);
            if (recentNews_.size() > MAX_RECENT_NEWS) {
                recentNews_.erase(recentNews_.begin());
            }

            // Log news
            std::string sentiment = event.sentiment == NewsSentiment::POSITIVE ? "+" :
                event.sentiment == NewsSentiment::NEGATIVE ? "-" : "~";
            std::string catName;
            switch (event.category) {
            case NewsCategory::GLOBAL: catName = "GLOBAL"; break;
            case NewsCategory::POLITICAL: catName = "POLITICAL"; break;
            case NewsCategory::INDUSTRY: catName = event.industry; break;
            case NewsCategory::COMPANY: catName = event.symbol; break;
            }
            Logger::info("[NEWS] {} {}: {} (mag: {:.3f})",
                sentiment, catName, event.headline, event.magnitude);

            // Apply to macro environment (handles GLOBAL + POLITICAL)
            macroEnv_.applyNews(event);

            // Track industry shocks
            if (event.category == NewsCategory::INDUSTRY) {
                double impact = event.magnitude;
                if (event.sentiment == NewsSentiment::NEGATIVE) impact = -impact;
                industryShocks_[event.industry] += impact;
            }

            // Track company shocks → feeds into fundamentals
            if (event.category == NewsCategory::COMPANY && !event.symbol.empty()) {
                double impact = event.magnitude;
                if (event.sentiment == NewsSentiment::NEGATIVE) impact = -impact;
                else if (event.sentiment == NewsSentiment::NEUTRAL) impact *= 0.1;
                companyShocks_[event.symbol] += impact;
            }

            // Notify agents
            for (auto& agent : agents_) {
                agent->updateBeliefs(event);
            }

            if (newsCallback_) {
                newsCallback_(event);
            }

            // Feed to NewsGenerator's recent buffer for SSE streaming
            newsGenerator_.addToRecent(event);
        }
    }

    void MarketEngine::updateFundamentals() {
        double globalShock = macroEnv_.getGlobalShock();

        // Read all params from RuntimeConfig (falls back to defaults if null)
        double annualGrowth = rtConfig_ ? rtConfig_->engine.annualGrowthRate : 0.08;
        double companyShockStd = rtConfig_ ? rtConfig_->engine.companyShockStd : 0.0002;
        double newsScale = rtConfig_ ? rtConfig_->engine.newsToFundamentalScale : 0.005;
        double indShockScale = rtConfig_ ? rtConfig_->engine.industryShockScale : 0.005;
        double indShockDecay = rtConfig_ ? rtConfig_->engine.industryShockDecay : 0.95;
        double compShockDecay = rtConfig_ ? rtConfig_->engine.companyShockDecay : 0.90;

        int tpd = simClock_.getTicksPerDay();
        double dailyGrowthPerTick = (annualGrowth / 252.0) / static_cast<double>(tpd);

        for (auto& [symbol, asset] : assets_) {
            // Industry shock: SCALE the accumulated value (fixes 10^30 blow-up)
            double industryShock = 0;
            auto it = industryShocks_.find(asset->getIndustry());
            if (it != industryShocks_.end()) {
                industryShock = it->second * indShockScale;
            }

            // Company-specific shock: news-driven + small random
            double companyShock = Random::normal(0, companyShockStd);
            auto cit = companyShocks_.find(symbol);
            if (cit != companyShocks_.end()) {
                companyShock += cit->second * newsScale;
            }

            asset->updateFundamental(globalShock, industryShock, companyShock, dailyGrowthPerTick);
        }

        // Decay shocks
        for (auto& [industry, shock] : industryShocks_) {
            shock *= indShockDecay;
        }
        for (auto& [symbol, shock] : companyShocks_) {
            shock *= compShockDecay;
        }
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

                    // Track per-type stats
                    auto& stats = agentTypeStats_[agent->getType()];
                    stats.ordersPlaced++;
                    if (order.side == OrderSide::BUY)
                        stats.buyOrders++;
                    else
                        stats.sellOrders++;

                    Logger::trace("Agent {} ({}) placed {} {} {} @ {:.2f} x {}",
                        agent->getId(), agent->getType(),
                        order.side == OrderSide::BUY ? "BUY" : "SELL",
                        order.type == OrderType::LIMIT ? "LIMIT" : "MARKET",
                        order.symbol, order.price, order.quantity);
                }
            }
        }
    }

    void MarketEngine::matchAllOrders() {
        std::vector<Trade> allTrades;

        for (auto& [symbol, book] : orderBooks_) {
            auto trades = book->matchOrders();

            for (auto& trade : trades) {
                // Tag buyer/seller types from lookup
                auto bit = agentIdToType_.find(trade.buyerId);
                trade.buyerType = (bit != agentIdToType_.end()) ? bit->second : "User";
                auto sit = agentIdToType_.find(trade.sellerId);
                trade.sellerType = (sit != agentIdToType_.end()) ? sit->second : "User";

                // Push to trade log ring buffer
                recentTrades_.push_back(trade);
                if (recentTrades_.size() > MAX_RECENT_TRADES) {
                    recentTrades_.pop_front();
                }

                // Update per-type fill stats
                agentTypeStats_[trade.buyerType].fills++;
                agentTypeStats_[trade.buyerType].volumeTraded += trade.quantity;
                agentTypeStats_[trade.buyerType].cashSpent += trade.price * trade.quantity;
                agentTypeStats_[trade.sellerType].fills++;
                agentTypeStats_[trade.sellerType].volumeTraded += trade.quantity;
                agentTypeStats_[trade.sellerType].cashReceived += trade.price * trade.quantity;

                allTrades.push_back(trade);
                totalTrades_++;

                Logger::debug("TRADE {}: {:.2f} x {} ({} -> {})",
                    trade.symbol, trade.price, trade.quantity,
                    trade.buyerType, trade.sellerType);

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
            auto* asset = getAsset(trade.symbol);
            if (asset) {
                // Use dampened price impact instead of direct set
                asset->applyTradePrice(trade.price, trade.quantity);
                asset->addVolume(trade.quantity);
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

} // namespace market
