#include "ApiServer.hpp"
#include "utils/Logger.hpp"
#include "core/RuntimeConfig.hpp"
#include <nlohmann/json.hpp>
#include <shared_mutex>

namespace market {

    ApiServer::ApiServer(Simulation& sim, const std::string& host, int port)
        : sim_(sim)
        , host_(host)
        , port_(port)
    {
        // Increase thread pool to handle concurrent SSE streams + requests
        server_.new_task_queue = [] { return new httplib::ThreadPool(64); };

        // Set timeouts to prevent stale connections from consuming threads
        // Long timeout needed for populate operations which can take minutes
        server_.set_read_timeout(300, 0);
        server_.set_write_timeout(300, 0);
        server_.set_keep_alive_timeout(10);

        setupRoutes();
    }

    ApiServer::~ApiServer() {
        stop();
    }

    void ApiServer::start() {
        if (running_.load()) return;

        running_ = true;

        serverThread_ = std::thread([this]() {
            Logger::info("API server starting on {}:{}", host_, port_);
            server_.listen(host_.c_str(), port_);
            });

        // Give server time to start
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    void ApiServer::stop() {
        if (!running_.load()) return;

        running_ = false;
        server_.stop();

        if (serverThread_.joinable()) {
            serverThread_.join();
        }

        Logger::info("API server stopped");
    }

    std::string ApiServer::jsonResponse(const nlohmann::json& j) {
        return j.dump();
    }

    std::string ApiServer::errorResponse(const std::string& message) {
        return nlohmann::json{ {"error", message} }.dump();
    }

    void ApiServer::setupRoutes() {
        // CORS headers
        server_.set_default_headers({
            {"Access-Control-Allow-Origin", "*"},
            {"Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"},
            {"Access-Control-Allow-Headers", "Content-Type"}
            });

        // OPTIONS handler for CORS preflight
        server_.Options(".*", [](const httplib::Request&, httplib::Response& res) {
            res.status = 200;
            });

        // GET /state - Current simulation state
        server_.Get("/state", [this](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse(sim_.getStateJson()), "application/json");
            });

        // GET /commodities - All commodity data
        server_.Get("/commodities", [this](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse(sim_.getCommoditiesJson()), "application/json");
            });

        // GET /agents - Agent summary
        server_.Get("/agents", [this](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse(sim_.getAgentSummaryJson()), "application/json");
            });

        // GET /metrics - Simulation metrics
        server_.Get("/metrics", [this](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse(sim_.getMetricsJson()), "application/json");
            });

        // GET /orderbook/:symbol - Order book for symbol
        server_.Get(R"(/orderbook/(\w+))", [this](const httplib::Request& req, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            std::string symbol = req.matches[1];

            auto* book = sim_.getEngine().getOrderBook(symbol);
            if (!book) {
                res.status = 404;
                res.set_content(errorResponse("Symbol not found"), "application/json");
                return;
            }

            auto snapshot = book->getSnapshot(10);
            nlohmann::json j;
            j["symbol"] = snapshot.symbol;
            j["bestBid"] = snapshot.bestBid;
            j["bestAsk"] = snapshot.bestAsk;
            j["spread"] = snapshot.spread;
            j["midPrice"] = snapshot.midPrice;

            j["bids"] = nlohmann::json::array();
            for (const auto& level : snapshot.bids) {
                j["bids"].push_back({ {"price", level.price}, {"quantity", level.totalQuantity} });
            }

            j["asks"] = nlohmann::json::array();
            for (const auto& level : snapshot.asks) {
                j["asks"].push_back({ {"price", level.price}, {"quantity", level.totalQuantity} });
            }

            res.set_content(jsonResponse(j), "application/json");
            });

        // POST /control - Start/pause/stop/reset simulation
        server_.Post("/control", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                auto body = nlohmann::json::parse(req.body);
                std::string action = body.value("action", "");
                Logger::info("[API] POST /control action={}", action);

                if (action == "start") {
                    sim_.start();
                }
                else if (action == "pause") {
                    sim_.pause();
                }
                else if (action == "resume") {
                    sim_.resume();
                }
                else if (action == "stop") {
                    sim_.stop();
                }
                else if (action == "reset") {
                    sim_.reset();
                    sim_.initialize();
                }
                else if (action == "step") {
                    int count = body.value("count", 1);
                    sim_.step(count);
                }
                else {
                    res.status = 400;
                    res.set_content(errorResponse("Unknown action: " + action), "application/json");
                    return;
                }

                res.set_content(jsonResponse(sim_.getStateJson()), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // POST /news - Inject news event
        server_.Post("/news", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                std::unique_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                auto body = nlohmann::json::parse(req.body);

                std::string category = body.value("category", "global");
                std::string sentimentStr = body.value("sentiment", "neutral");
                double magnitude = body.value("magnitude", 0.05);
                std::string headline = body.value("headline", "");
                std::string target = body.value("target", "");

                NewsSentiment sentiment = NewsSentiment::NEUTRAL;
                if (sentimentStr == "positive") sentiment = NewsSentiment::POSITIVE;
                else if (sentimentStr == "negative") sentiment = NewsSentiment::NEGATIVE;

                auto& newsGen = sim_.getEngine().getNewsGenerator();

                bool valid = false;
                if (category == "global") {
                    newsGen.injectGlobalNews(sentiment, magnitude, headline);
                    valid = true;
                }
                else if (category == "political") {
                    newsGen.injectGlobalNews(sentiment, magnitude, headline);
                    valid = true;
                }
                else if (category == "supply") {
                    if (target.empty()) {
                        res.status = 400;
                        res.set_content(errorResponse("Supply news requires 'target' commodity symbol"), "application/json");
                        return;
                    }
                    newsGen.injectSupplyNews(target, sentiment, magnitude, headline);
                    valid = true;
                }
                else if (category == "demand") {
                    if (target.empty()) {
                        res.status = 400;
                        res.set_content(errorResponse("Demand news requires 'target' commodity symbol"), "application/json");
                        return;
                    }
                    newsGen.injectDemandNews(target, sentiment, magnitude, headline);
                    valid = true;
                }
                else {
                    res.status = 400;
                    res.set_content(errorResponse("Invalid category. Must be: global, political, supply, demand"), "application/json");
                    return;
                }

                Logger::info("Injected {} news: {} (mag: {})", category, headline, magnitude);

                res.set_content(jsonResponse({ {"status", "ok"} }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // GET /config - Return full RuntimeConfig as JSON
        server_.Get("/config", [this](const httplib::Request&, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            res.set_content(jsonResponse(sim_.getRuntimeConfig().toJson()), "application/json");
            });

        // GET /config/defaults - Return a fresh default RuntimeConfig
        server_.Get("/config/defaults", [this](const httplib::Request&, httplib::Response& res) {
            RuntimeConfig defaults;
            res.set_content(jsonResponse(defaults.toJson()), "application/json");
            });

        // POST /config - Merge-patch update to RuntimeConfig (hot params only)
        server_.Post("/config", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                Logger::info("[API] POST /config - updating runtime config");
                std::unique_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                auto body = nlohmann::json::parse(req.body);
                Logger::info("[API] POST /config - lock acquired, applying {} keys", body.size());

                // Merge-patch into the live config
                sim_.getRuntimeConfig().fromJson(body);

                // Push hot-reloadable values to subsystems
                auto& cfg = sim_.getRuntimeConfig();

                // Tick rate
                if (body.contains("simulation") && body["simulation"].contains("tickRateMs")) {
                    sim_.setTickRate(cfg.simulation.tickRateMs);
                }

                // News lambda
                if (body.contains("news") && body["news"].contains("lambda")) {
                    sim_.getEngine().getNewsGenerator().setLambda(cfg.news.lambda);
                }

                // Commodity params (push to all commodities)
                if (body.contains("commodity")) {
                    for (auto& [sym, commodity] : sim_.getEngine().getMutableCommodities()) {
                        commodity->setMaxDailyMove(cfg.commodity.circuitBreakerLimit);
                        commodity->setImpactDampening(cfg.commodity.impactDampening);
                        commodity->setPriceFloor(cfg.commodity.priceFloor);
                    }
                }

                // OrderBook expiry
                if (body.contains("orderBook") && body["orderBook"].contains("orderExpiryMs")) {
                    for (auto& [sym, book] : sim_.getEngine().getOrderBooks()) {
                        book->setMaxOrderAgeMs(cfg.orderBook.orderExpiryMs);
                    }
                }

                res.set_content(jsonResponse({
                    {"status", "ok"},
                    {"message", "Config updated (hot reload). Use POST /reinitialize for cold params."}
                    }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // POST /config/reset - Reset to defaults + reinitialize
        server_.Post("/config/reset", [this](const httplib::Request&, httplib::Response& res) {
            try {
                sim_.getRuntimeConfig() = RuntimeConfig();
                sim_.reinitialize();  // reinitialize() acquires its own lock
                res.set_content(jsonResponse({
                    {"status", "ok"},
                    {"message", "Config reset to defaults and simulation reinitialized."}
                    }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 500;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // POST /reinitialize - Rebuild agents/commodities with current config (cold params)
        server_.Post("/reinitialize", [this](const httplib::Request&, httplib::Response& res) {
            try {
                Logger::info("[API] POST /reinitialize - starting");
                sim_.reinitialize();  // reinitialize() acquires its own lock
                Logger::info("[API] POST /reinitialize - done");
                res.set_content(jsonResponse({
                    {"status", "ok"},
                    {"message", "Simulation reinitialized with current config."}
                    }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 500;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // POST /orders - Submit user order for execution
        server_.Post("/orders", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                std::unique_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                auto body = nlohmann::json::parse(req.body);

                std::string symbol = body.value("symbol", "");
                std::string sideStr = body.value("side", "BUY");
                std::string typeStr = body.value("type", "MARKET");
                double price = body.value("price", 0.0);
                int64_t quantity = body.value("quantity", 0);
                std::string userId = body.value("userId", "");

                if (symbol.empty() || quantity <= 0) {
                    res.status = 400;
                    res.set_content(errorResponse("Invalid symbol or quantity"), "application/json");
                    return;
                }

                // Get current commodity price
                auto* commodity = sim_.getEngine().getCommodity(symbol);
                if (!commodity) {
                    res.status = 404;
                    res.set_content(errorResponse("Symbol not found: " + symbol), "application/json");
                    return;
                }

                // Get order book
                auto* book = sim_.getEngine().getOrderBook(symbol);
                if (!book) {
                    res.status = 500;
                    res.set_content(errorResponse("Order book unavailable"), "application/json");
                    return;
                }

                // Determine execution price
                double execPrice = commodity->getPrice();
                OrderSide side = (sideStr == "SELL") ? OrderSide::SELL : OrderSide::BUY;

                // For market orders, use best available price
                auto snapshot = book->getSnapshot(1);
                if (side == OrderSide::BUY && snapshot.bestAsk > 0) {
                    execPrice = snapshot.bestAsk;
                }
                else if (side == OrderSide::SELL && snapshot.bestBid > 0) {
                    execPrice = snapshot.bestBid;
                }

                // For limit orders, check price validity
                OrderType orderType = (typeStr == "LIMIT") ? OrderType::LIMIT : OrderType::MARKET;
                if (orderType == OrderType::LIMIT && price > 0) {
                    execPrice = price;
                }

                // Create and submit order
                Order order;
                order.id = static_cast<OrderId>(std::chrono::steady_clock::now().time_since_epoch().count());
                order.agentId = 0;  // User orders have agentId = 0
                order.symbol = symbol;
                order.side = side;
                order.type = orderType;
                order.price = execPrice;
                order.quantity = quantity;
                order.timestamp = now();

                // Add to order book and try to match
                book->addOrder(order);
                auto trades = book->matchOrders();

                // Check if our order was filled
                double filledQty = 0;
                double avgFillPrice = 0;
                for (const auto& trade : trades) {
                    if (trade.buyerId == 0 || trade.sellerId == 0) {
                        filledQty += trade.quantity;
                        avgFillPrice += trade.price * trade.quantity;
                    }
                }
                if (filledQty > 0) {
                    avgFillPrice /= filledQty;
                }

                // Update commodity price
                if (!trades.empty()) {
                    commodity->setPrice(trades.back().price);
                }

                nlohmann::json response;
                response["status"] = (filledQty >= quantity) ? "filled" : (filledQty > 0 ? "partial" : "pending");
                response["orderId"] = order.id;
                response["symbol"] = symbol;
                response["side"] = sideStr;
                response["quantity"] = quantity;
                response["filledQuantity"] = filledQty;
                response["avgFillPrice"] = avgFillPrice > 0 ? avgFillPrice : execPrice;
                response["userId"] = userId;

                Logger::info("User order: {} {} {} @ {} -> {} filled @ {}",
                    sideStr, quantity, symbol, execPrice,
                    response["status"].get<std::string>(),
                    response["avgFillPrice"].get<double>());

                res.set_content(jsonResponse(response), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // GET /stream - Server-Sent Events for real-time data
        server_.Get("/stream", [this](const httplib::Request&, httplib::Response& res) {
            res.set_header("Content-Type", "text/event-stream");
            res.set_header("Cache-Control", "no-cache");
            res.set_header("Connection", "keep-alive");
            res.set_header("Access-Control-Allow-Origin", "*");

            res.set_chunked_content_provider(
                "text/event-stream",
                [this](size_t /*offset*/, httplib::DataSink& sink) {
                    int tickCounter = 0;
                    while (running_.load()) {
                        // Send state update every tick
                        nlohmann::json data;
                        {
                            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                            data["type"] = "update";
                            data["tick"] = sim_.getCurrentTick();
                            data["running"] = sim_.isRunning();
                            data["paused"] = sim_.isPaused();
                            data["simDate"] = sim_.getEngine().getSimClock().currentDateString();
                            data["simDateTime"] = sim_.getEngine().getSimClock().currentDateTimeString();
                            data["simTimestamp"] = sim_.getEngine().getSimClock().currentTimestamp();

                            // Include prices
                            data["commodities"] = nlohmann::json::array();
                            for (const auto& [symbol, commodity] : sim_.getEngine().getCommodities()) {
                                data["commodities"].push_back({
                                    {"symbol", symbol},
                                    {"name", commodity->getName()},
                                    {"price", commodity->getPrice()},
                                    {"change", commodity->getReturn(1)}
                                    });
                            }
                        } // release shared lock before writing to sink

                        std::string event = "data: " + data.dump() + "\n\n";
                        if (!sink.write(event.c_str(), event.size())) {
                            return false;  // Connection closed
                        }

                        // Send news events less frequently
                        if (tickCounter % 5 == 0) {
                            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                            auto news = sim_.getEngine().getNewsGenerator().getRecentNews(3);
                            if (!news.empty()) {
                                nlohmann::json newsData;
                                newsData["type"] = "news";
                                newsData["events"] = nlohmann::json::array();
                                for (const auto& n : news) {
                                    newsData["events"].push_back({
                                            {"headline", n.headline},
                                            {"category", n.category == NewsCategory::GLOBAL ? "global" :
                                                         n.category == NewsCategory::POLITICAL ? "political" :
                                                         n.category == NewsCategory::SUPPLY ? "supply" : "demand"},
                                            {"sentiment", n.sentiment == NewsSentiment::POSITIVE ? "positive" :
                                                          n.sentiment == NewsSentiment::NEGATIVE ? "negative" : "neutral"},
                                            {"magnitude", n.magnitude},
                                            {"symbol", n.symbol},
                                            {"subcategory", n.subcategory}
                                        });
                                }
                                std::string newsEvent = "data: " + newsData.dump() + "\n\n";
                                sink.write(newsEvent.c_str(), newsEvent.size());
                            }
                        }

                        tickCounter++;
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                    return false;
                }
            );
            });

        // GET /trades - Recent trade log with agent type info
        server_.Get("/trades", [this](const httplib::Request& req, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            std::string filterSymbol = req.has_param("symbol") ? req.get_param_value("symbol") : "";
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 100;

            const auto& trades = sim_.getEngine().getRecentTrades();

            nlohmann::json j = nlohmann::json::array();
            int count = 0;
            // Iterate in reverse for newest-first
            for (auto it = trades.rbegin(); it != trades.rend() && count < limit; ++it) {
                if (!filterSymbol.empty() && it->symbol != filterSymbol) continue;

                j.push_back({
                    {"symbol", it->symbol},
                    {"price", it->price},
                    {"quantity", it->quantity},
                    {"buyerId", it->buyerId},
                    {"sellerId", it->sellerId},
                    {"buyerType", it->buyerType},
                    {"sellerType", it->sellerType},
                    {"timestamp", it->timestamp}
                    });
                count++;
            }

            res.set_content(jsonResponse(j), "application/json");
            });

        // GET /diagnostics - One-stop debugging endpoint
        server_.Get("/diagnostics", [this](const httplib::Request&, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());

            nlohmann::json diag;

            // 1. Agent population summary
            diag["agents"] = sim_.getAgentSummaryJson();

            // 2. Per-type order/trade stats
            nlohmann::json statsJson;
            for (const auto& [type, stats] : sim_.getEngine().getAgentTypeStats()) {
                statsJson[type] = {
                    {"ordersPlaced", stats.ordersPlaced},
                    {"buyOrders", stats.buyOrders},
                    {"sellOrders", stats.sellOrders},
                    {"fills", stats.fills},
                    {"volumeTraded", stats.volumeTraded},
                    {"cashSpent", stats.cashSpent},
                    {"cashReceived", stats.cashReceived},
                    {"buyToSellRatio", stats.sellOrders > 0 ? static_cast<double>(stats.buyOrders) / stats.sellOrders : 0.0}
                };
            }
            diag["agentTypeStats"] = statsJson;

            // 3. Commodity health
            nlohmann::json commoditiesJson;
            for (const auto& [sym, commodity] : sim_.getEngine().getCommodities()) {
                auto* book = sim_.getEngine().getOrderBook(sym);
                auto snap = book ? book->getSnapshot(1) : OrderBookSnapshot{};

                commoditiesJson[sym] = {
                    {"price", commodity->getPrice()},
                    {"dailyVolume", commodity->getDailyVolume()},
                    {"bestBid", snap.bestBid},
                    {"bestAsk", snap.bestAsk},
                    {"spread", snap.spread},
                    {"spreadPct", snap.midPrice > 0 ? snap.spread / snap.midPrice * 100.0 : 0.0}
                };
            }
            diag["commodities"] = commoditiesJson;

            // 4. Simulation clock
            const auto& clock = sim_.getEngine().getSimClock();
            diag["clock"] = {
                {"currentDate", clock.currentDateString()},
                {"currentDateTime", clock.currentDateTimeString()},
                {"timestamp", clock.currentTimestamp()},
                {"ticksPerDay", clock.getTicksPerDay()}
            };

            // 5. Top-level metrics
            auto metrics = sim_.getEngine().getMetrics();
            diag["metrics"] = {
                {"totalTicks", metrics.totalTicks},
                {"totalTrades", metrics.totalTrades},
                {"totalOrders", metrics.totalOrders},
                {"avgSpread", metrics.avgSpread},
                {"tradeLogSize", sim_.getEngine().getRecentTrades().size()}
            };

            // 6. Recent trades sample (last 10)
            nlohmann::json recentTrades = nlohmann::json::array();
            const auto& trades = sim_.getEngine().getRecentTrades();
            int count = 0;
            for (auto it = trades.rbegin(); it != trades.rend() && count < 10; ++it, ++count) {
                recentTrades.push_back({
                    {"symbol", it->symbol},
                    {"price", it->price},
                    {"quantity", it->quantity},
                    {"buyerType", it->buyerType},
                    {"sellerType", it->sellerType}
                    });
            }
            diag["recentTrades"] = recentTrades;

            res.set_content(jsonResponse(diag), "application/json");
            });

        // Health check
        server_.Get("/health", [](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse({ {"status", "healthy"} }), "application/json");
            });

        // GET /candles/bulk - Get candles for all symbols at once
        // NOTE: Must be registered BEFORE /candles/(\w+) or the regex swallows "bulk" as a symbol
        server_.Get("/candles/bulk", [this](const httplib::Request& req, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            std::string intervalStr = req.has_param("interval") ? req.get_param_value("interval") : "1m";
            int64_t since = req.has_param("since") ? std::stoll(req.get_param_value("since")) : 0;
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 500;

            auto interval = CandleAggregator::parseInterval(intervalStr);

            auto allCandles = sim_.getEngine().getCandleAggregator().getAllCandles(interval, since);

            nlohmann::json j;
            for (const auto& [symbol, candles] : allCandles) {
                j[symbol] = nlohmann::json::array();
                for (const auto& c : candles) {
                    j[symbol].push_back({
                        {"time", c.time},
                        {"open", c.open},
                        {"high", c.high},
                        {"low", c.low},
                        {"close", c.close},
                        {"volume", c.volume}
                        });
                }
            }

            res.set_content(jsonResponse(j), "application/json");
            });

        // GET /candles/:symbol - Get OHLCV candles for a symbol
        server_.Get(R"(/candles/(\w+))", [this](const httplib::Request& req, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            std::string symbol = req.matches[1];

            // Parse query params
            std::string intervalStr = req.has_param("interval") ? req.get_param_value("interval") : "1m";
            int64_t since = req.has_param("since") ? std::stoll(req.get_param_value("since")) : 0;
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 500;

            auto interval = CandleAggregator::parseInterval(intervalStr);

            auto candles = sim_.getEngine().getCandleAggregator().getCandles(
                symbol, interval, since, limit);

            nlohmann::json j = nlohmann::json::array();
            for (const auto& c : candles) {
                j.push_back({
                    {"time", c.time},
                    {"open", c.open},
                    {"high", c.high},
                    {"low", c.low},
                    {"close", c.close},
                    {"volume", c.volume}
                    });
            }

            res.set_content(jsonResponse(j), "application/json");
            });

        // POST /populate - Populate historical data (async)
        server_.Post("/populate", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                auto body = nlohmann::json::parse(req.body);
                int days = body.value("days", 180);
                std::string startDate = body.value("startDate", "2025-08-07");
                Logger::info("[API] POST /populate days={} startDate={}", days, startDate);

                if (sim_.isRunning()) {
                    Logger::warn("[API] POST /populate rejected: sim is running");
                    res.status = 400;
                    res.set_content(errorResponse("Stop simulation before populating"), "application/json");
                    return;
                }

                if (sim_.isPopulating()) {
                    Logger::warn("[API] POST /populate rejected: already populating");
                    res.status = 400;
                    res.set_content(errorResponse("Population already in progress"), "application/json");
                    return;
                }

                Logger::info("[API] POST /populate - starting background thread");
                // Start populate in background thread
                std::thread([this, days, startDate]() {
                    Logger::info("[API] Populate thread started");
                    sim_.populate(days, startDate);
                    Logger::info("[API] Populate thread finished");
                    }).detach();

                // Return immediately - client polls /state for progress
                res.set_content(jsonResponse({
                    {"status", "started"},
                    {"message", "Population started. Poll /state for progress."},
                    {"days", days},
                    {"startDate", startDate}
                    }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // POST /restore - Restore simulation state from saved data
        server_.Post("/restore", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                std::unique_lock<std::shared_mutex> lock(sim_.getEngineMutex());
                auto body = nlohmann::json::parse(req.body);
                sim_.restore(body);
                res.set_content(jsonResponse({ {"status", "ok"} }), "application/json");
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // GET /news/history - Get recent news history
        server_.Get("/news/history", [this](const httplib::Request& req, httplib::Response& res) {
            std::shared_lock<std::shared_mutex> lock(sim_.getEngineMutex());
            int limit = req.has_param("limit") ? std::stoi(req.get_param_value("limit")) : 50;

            auto& newsGen = sim_.getEngine().getNewsGenerator();
            auto history = newsGen.getNewsHistory();

            // Return last N events  
            nlohmann::json j = nlohmann::json::array();
            size_t start = history.size() > static_cast<size_t>(limit) ? history.size() - limit : 0;
            for (size_t i = start; i < history.size(); ++i) {
                const auto& n = history[i];
                std::string catStr;
                switch (n.category) {
                case NewsCategory::GLOBAL: catStr = "global"; break;
                case NewsCategory::POLITICAL: catStr = "political"; break;
                case NewsCategory::SUPPLY: catStr = "supply"; break;
                case NewsCategory::DEMAND: catStr = "demand"; break;
                }
                j.push_back({
                    {"headline", n.headline},
                    {"category", catStr},
                    {"sentiment", n.sentiment == NewsSentiment::POSITIVE ? "positive" :
                                  n.sentiment == NewsSentiment::NEGATIVE ? "negative" : "neutral"},
                    {"magnitude", n.magnitude},
                    {"symbol", n.symbol},
                    {"subcategory", n.subcategory},
                    {"timestamp", n.timestamp}
                    });
            }

            res.set_content(jsonResponse(j), "application/json");
            });

        // POST /export - Export tick data to files
        server_.Post("/export", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                auto body = nlohmann::json::parse(req.body.empty() ? "{}" : req.body);

                std::string format = body.value("format", "json");
                std::string dataDir = body.value("dataDir", "/data");
                size_t maxTicks = body.value("maxTicks", 0);

                if (sim_.isPopulating()) {
                    res.status = 400;
                    res.set_content(errorResponse("Cannot export while populating"), "application/json");
                    return;
                }

                bool success = false;
                std::string fullPath;

                if (format == "csv") {
                    fullPath = dataDir + "/csv";
                    success = sim_.getTickBuffer().exportToCsv(fullPath, maxTicks);
                }
                else {
                    fullPath = dataDir + "/full_1m.json";
                    success = sim_.getTickBuffer().exportToJson(fullPath, maxTicks);

                    if (success && maxTicks == 0) {
                        std::string devPath = dataDir + "/dev_100k.json";
                        success = sim_.getTickBuffer().exportToJson(devPath, 100000);
                    }
                }

                if (success) {
                    res.set_content(jsonResponse({
                        {"status", "ok"},
                        {"path", fullPath},
                        {"format", format},
                        {"ticksExported", sim_.getTickBuffer().getTickCount()}
                        }), "application/json");
                }
                else {
                    res.status = 500;
                    res.set_content(errorResponse("Export failed"), "application/json");
                }
            }
            catch (const std::exception& e) {
                res.status = 400;
                res.set_content(errorResponse(e.what()), "application/json");
            }
            });

        // GET /export/status - Check export status
        server_.Get("/export/status", [this](const httplib::Request&, httplib::Response& res) {
            auto& buffer = sim_.getTickBuffer();

            res.set_content(jsonResponse({
                {"isExporting", buffer.isExporting()},
                {"progress", buffer.getExportProgress()},
                {"totalTicks", buffer.getTickCount()},
                {"currentTick", buffer.getCurrentTick()}
                }), "application/json");
            });

        // GET /ticks/count - Get tick count in buffer
        server_.Get("/ticks/count", [this](const httplib::Request&, httplib::Response& res) {
            res.set_content(jsonResponse({
                {"count", sim_.getTickBuffer().getTickCount()},
                {"currentTick", sim_.getTickBuffer().getCurrentTick()}
                }), "application/json");
            });
    }

} // namespace market
