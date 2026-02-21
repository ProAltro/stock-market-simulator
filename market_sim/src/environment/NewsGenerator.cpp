#include "NewsGenerator.hpp"
#include "utils/Random.hpp"
#include <cmath>

namespace market {

    NewsGenerator::NewsGenerator(double lambda,
        double globalImpactStd,
        double supplyImpactStd,
        double demandImpactStd)
        : lambda_(lambda)
        , globalImpactStd_(globalImpactStd)
        , supplyImpactStd_(supplyImpactStd)
        , demandImpactStd_(demandImpactStd)
    {
    }

    void NewsGenerator::setCommodities(const std::vector<std::string>& symbols) {
        symbols_ = symbols;
    }

    void NewsGenerator::setCommodityNames(const std::map<std::string, std::string>& symbolToName) {
        symbolToName_ = symbolToName;
    }

    void NewsGenerator::setCommodityCategories(const std::map<std::string, std::string>& symbolToCategory) {
        symbolToCategory_ = symbolToCategory;
    }

    std::vector<NewsEvent> NewsGenerator::generate(Timestamp currentTime, double tickScale) {
        std::vector<NewsEvent> events;

        auto injected = getInjectedNews();
        for (auto& news : injected) {
            news.timestamp = currentTime;
            events.push_back(news);
        }

        int numEvents = Random::poisson(lambda_ * tickScale);

        for (int i = 0; i < numEvents; ++i) {
            double r = Random::uniform(0, 1);

            if (r < 0.15) {
                events.push_back(generateGlobalNews(currentTime));
            }
            else if (r < 0.25) {
                events.push_back(generatePoliticalNews(currentTime));
            }
            else if (r < 0.60) {
                if (!symbols_.empty()) {
                    events.push_back(generateSupplyNews(currentTime));
                }
            }
            else {
                if (!symbols_.empty()) {
                    events.push_back(generateDemandNews(currentTime));
                }
            }
        }

        for (const auto& e : events) {
            newsHistory_.push_back(e);
            if (newsHistory_.size() > MAX_HISTORY) {
                newsHistory_.erase(newsHistory_.begin());
            }
        }

        return events;
    }

    void NewsGenerator::injectNews(const NewsEvent& news) {
        injectedNews_.push_back(news);
    }

    void NewsGenerator::injectGlobalNews(NewsSentiment sentiment, double magnitude, const std::string& headline) {
        NewsEvent news;
        news.category = NewsCategory::GLOBAL;
        news.sentiment = sentiment;
        news.magnitude = magnitude;
        news.headline = headline.empty() ? generateHeadline(NewsCategory::GLOBAL, sentiment, "", "") : headline;
        news.timestamp = 0;
        injectedNews_.push_back(news);
    }

    void NewsGenerator::injectSupplyNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline) {
        NewsEvent news;
        news.category = NewsCategory::SUPPLY;
        news.symbol = symbol;
        auto it = symbolToName_.find(symbol);
        if (it != symbolToName_.end()) news.commodityName = it->second;
        news.sentiment = sentiment;
        news.magnitude = magnitude;
        news.headline = headline.empty() ? generateHeadline(NewsCategory::SUPPLY, sentiment, symbol, news.commodityName) : headline;
        news.timestamp = 0;
        injectedNews_.push_back(news);
    }

    void NewsGenerator::injectDemandNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline) {
        NewsEvent news;
        news.category = NewsCategory::DEMAND;
        news.symbol = symbol;
        auto it = symbolToName_.find(symbol);
        if (it != symbolToName_.end()) news.commodityName = it->second;
        news.sentiment = sentiment;
        news.magnitude = magnitude;
        news.headline = headline.empty() ? generateHeadline(NewsCategory::DEMAND, sentiment, symbol, news.commodityName) : headline;
        news.timestamp = 0;
        injectedNews_.push_back(news);
    }

    std::vector<NewsEvent> NewsGenerator::getInjectedNews() {
        auto news = std::move(injectedNews_);
        injectedNews_.clear();
        return news;
    }

    std::vector<NewsEvent> NewsGenerator::getRecentNews(size_t count) const {
        if (recentNews_.empty()) return {};
        size_t start = recentNews_.size() > count ? recentNews_.size() - count : 0;
        return std::vector<NewsEvent>(recentNews_.begin() + start, recentNews_.end());
    }

    void NewsGenerator::addToRecent(const NewsEvent& news) {
        recentNews_.push_back(news);
        if (recentNews_.size() > MAX_RECENT) {
            recentNews_.erase(recentNews_.begin());
        }
    }

    NewsEvent NewsGenerator::generateGlobalNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::GLOBAL;
        news.timestamp = time;

        double r = Random::uniform(0, 1);
        news.sentiment = (r < 0.4) ? NewsSentiment::POSITIVE :
                         (r < 0.7) ? NewsSentiment::NEGATIVE : NewsSentiment::NEUTRAL;

        news.magnitude = std::abs(Random::normal(0, globalImpactStd_));
        news.subcategory = "economic";
        news.headline = generateHeadline(NewsCategory::GLOBAL, news.sentiment, "", "");

        return news;
    }

    NewsEvent NewsGenerator::generatePoliticalNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::POLITICAL;
        news.timestamp = time;

        double r = Random::uniform(0, 1);
        news.sentiment = (r < 0.35) ? NewsSentiment::POSITIVE :
                         (r < 0.65) ? NewsSentiment::NEGATIVE : NewsSentiment::NEUTRAL;

        news.magnitude = std::abs(Random::normal(0, politicalImpactStd_));
        news.subcategory = "political";
        news.headline = generateHeadline(NewsCategory::POLITICAL, news.sentiment, "", "");

        return news;
    }

    NewsEvent NewsGenerator::generateSupplyNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::SUPPLY;
        news.timestamp = time;
        news.symbol = symbols_[Random::uniformInt(0, symbols_.size() - 1)];

        auto nameIt = symbolToName_.find(news.symbol);
        news.commodityName = (nameIt != symbolToName_.end()) ? nameIt->second : news.symbol;

        double r = Random::uniform(0, 1);
        news.sentiment = (r < 0.45) ? NewsSentiment::NEGATIVE :
                         (r < 0.55) ? NewsSentiment::POSITIVE : NewsSentiment::NEUTRAL;

        news.magnitude = std::abs(Random::normal(0, supplyImpactStd_));

        std::vector<std::string> subcats = {"production", "logistics", "inventory", "weather"};
        news.subcategory = subcats[Random::uniformInt(0, subcats.size() - 1)];

        news.headline = generateHeadline(NewsCategory::SUPPLY, news.sentiment, news.symbol, news.commodityName);

        return news;
    }

    NewsEvent NewsGenerator::generateDemandNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::DEMAND;
        news.timestamp = time;
        news.symbol = symbols_[Random::uniformInt(0, symbols_.size() - 1)];

        auto nameIt = symbolToName_.find(news.symbol);
        news.commodityName = (nameIt != symbolToName_.end()) ? nameIt->second : news.symbol;

        double r = Random::uniform(0, 1);
        news.sentiment = (r < 0.45) ? NewsSentiment::POSITIVE :
                         (r < 0.55) ? NewsSentiment::NEGATIVE : NewsSentiment::NEUTRAL;

        news.magnitude = std::abs(Random::normal(0, demandImpactStd_));

        std::vector<std::string> subcats = {"consumption", "industrial", "seasonal", "export"};
        news.subcategory = subcats[Random::uniformInt(0, subcats.size() - 1)];

        news.headline = generateHeadline(NewsCategory::DEMAND, news.sentiment, news.symbol, news.commodityName);

        return news;
    }

    std::string NewsGenerator::generateHeadline(NewsCategory category, NewsSentiment sentiment,
        const std::string& symbol, const std::string& name) {

        std::string displayName = name.empty() ? symbol : name;

        static const std::vector<std::string> positiveGlobal = {
            "Global economic outlook improves, commodity demand expected to rise",
            "Central bank signals continued growth, markets rally",
            "Manufacturing PMI beats expectations across major economies",
            "Infrastructure spending packages announced worldwide",
            "Trade volumes surge as supply chains normalize"
        };

        static const std::vector<std::string> negativeGlobal = {
            "Recession fears mount as economic indicators weaken",
            "Inflation concerns push commodity prices higher",
            "Global trade tensions escalate, supply chains disrupted",
            "Central bank rate hikes weigh on commodity demand",
            "Currency volatility spikes across emerging markets"
        };

        static const std::vector<std::string> neutralGlobal = {
            "Mixed economic signals keep markets cautious",
            "Central bank minutes show divided outlook",
            "Commodity markets trade sideways awaiting data"
        };

        static const std::vector<std::string> positivePolitical = {
            "Trade tariffs lifted on key commodities",
            "New infrastructure bill passes, boosting material demand",
            "Government announces subsidies for domestic production",
            "International trade agreement reduces barriers",
            "Regulatory approval accelerates commodity exports"
        };

        static const std::vector<std::string> negativePolitical = {
            "New tariffs imposed on commodity imports",
            "Export restrictions announced for strategic materials",
            "Political instability disrupts supply routes",
            "Sanctions expand to include commodity trading",
            "Regulatory crackdown tightens market access"
        };

        static const std::vector<std::string> neutralPolitical = {
            "Trade negotiations continue without resolution",
            "Policy review committee meets on commodity regulations",
            "Markets await government policy announcement"
        };

        std::map<std::string, std::vector<std::string>> supplyNegative = {
            {"OIL", {"Oil rig fire cuts production by 15%", "Pipeline rupture disrupts crude supply",
                     "OPEC announces production cuts", "Refinery outage tightens oil supply",
                     "Oil field workers strike halts production"}},
            {"STEEL", {"Steel mill blast furnace outage cuts output", "Iron ore supply disruption hits steel production",
                       "Steel plant closure announced due to maintenance", "Raw material shortage slows steel output",
                       "Environmental regulations force production cuts"}},
            {"WOOD", {"Wildfire damages timber reserves", "Logging restrictions tighten supply",
                      "Sawmill accident reduces wood processing capacity", "Pest infestation affects timber harvest",
                      "Transport strike delays wood shipments"}},
            {"BRICK", {"Clay quarry exhaustion limits brick production", "Kiln fire halts brick manufacturing",
                       "Energy costs force brick plant closures", "Building material shortage hits brick supply",
                       "Environmental rules curb brick kiln operations"}},
            {"GRAIN", {"Drought conditions damage grain harvest", "Flooding destroys wheat fields",
                       "Grain elevator fire destroys stored reserves", "Pest outbreak threatens crop yields",
                       "Export ban reduces grain availability"}}
        };

        std::map<std::string, std::vector<std::string>> supplyPositive = {
            {"OIL", {"New oil field discovered, production to increase", "Refinery expansion boosts fuel supply",
                     "OPEC increases production quota", "Offshore drilling permit approved",
                     "Oil storage facilities reach capacity, supply abundant"}},
            {"STEEL", {"New steel mill opens, boosting capacity", "Iron ore mine expansion increases supply",
                       "Steel recycling program scales up", "Technology upgrade improves steel output",
                       "Import agreements secure steel supply"}},
            {"WOOD", {"Sustainable forestry program expands harvest", "New sawmill opens in key region",
                      "Timber imports increase supply", "Fast-growing tree program shows results",
                      "Logging permits expanded for season"}},
            {"BRICK", {"New clay deposit discovered", "Brick plant expansion completed",
                       "Energy-efficient kilns boost production", "Import agreements secure brick supply",
                       "Recycling program increases brick availability"}},
            {"GRAIN", {"Record harvest expected this season", "New farmland brought into production",
                       "Favorable weather boosts crop yields", "Grain storage capacity expanded",
                       "Government subsidies increase grain planting"}}
        };

        std::map<std::string, std::vector<std::string>> demandPositive = {
            {"OIL", {"Manufacturing expansion drives oil demand", "Shipping activity surge boosts fuel consumption",
                     "Cold winter increases heating oil demand", "Airline industry recovery lifts jet fuel demand",
                     "Industrial production uptick raises oil consumption"}},
            {"STEEL", {"Infrastructure spending bill boosts steel demand", "Automotive production ramp increases steel needs",
                       "Construction boom drives steel consumption", "Shipbuilding orders lift steel demand",
                       "Appliance manufacturing expansion raises steel needs"}},
            {"WOOD", {"Housing starts surge drives lumber demand", "Furniture manufacturing expansion boosts wood needs",
                      "Paper industry recovery lifts pulp demand", "Renovation wave increases wood consumption",
                      "Export demand for timber products rises"}},
            {"BRICK", {"Commercial construction boom lifts brick demand", "Housing development expansion drives brick needs",
                       "Infrastructure projects increase brick consumption", "Restoration work boosts specialty brick demand",
                       "Export orders for bricks surge"}},
            {"GRAIN", {"Food processing expansion increases grain demand", "Livestock feed demand rises with herd growth",
                       "Export agreements boost grain purchases", "Biofuel mandates lift grain consumption",
                       "Population growth drives food grain needs"}}
        };

        std::map<std::string, std::vector<std::string>> demandNegative = {
            {"OIL", {"Industrial slowdown reduces oil consumption", "Warm winter cuts heating oil demand",
                     "Electric vehicle adoption dampens fuel demand", "Shipping recession lowers bunker fuel needs",
                     "Factory closures reduce oil consumption"}},
            {"STEEL", {"Construction sector slowdown hits steel demand", "Automotive production cuts reduce steel needs",
                       "Infrastructure delays dampen steel consumption", "Manufacturing recession lowers steel demand",
                       "Import competition reduces domestic steel needs"}},
            {"WOOD", {"Housing market cools, lumber demand falls", "Paper industry shift reduces pulp needs",
                      "Digital transition cuts paper demand", "Construction slowdown hits wood consumption",
                      "Furniture imports reduce domestic wood needs"}},
            {"BRICK", {"Construction projects delayed, brick demand falls", "Housing market slowdown reduces brick needs",
                       "Alternative materials gain market share", "Commercial real estate slump hits brick demand",
                       "Renovation activity slows, brick consumption drops"}},
            {"GRAIN", {"Livestock herd reduction cuts feed demand", "Food processing slowdown reduces grain needs",
                       "Biofuel mandates relaxed, grain demand falls", "Export restrictions reduce grain purchases",
                       "Dietary shifts lower grain consumption"}}
        };

        switch (category) {
            case NewsCategory::GLOBAL: {
                const auto& templates = (sentiment == NewsSentiment::POSITIVE) ? positiveGlobal :
                                        (sentiment == NewsSentiment::NEGATIVE) ? negativeGlobal : neutralGlobal;
                return templates[Random::uniformInt(0, templates.size() - 1)];
            }
            case NewsCategory::POLITICAL: {
                const auto& templates = (sentiment == NewsSentiment::POSITIVE) ? positivePolitical :
                                        (sentiment == NewsSentiment::NEGATIVE) ? negativePolitical : neutralPolitical;
                return templates[Random::uniformInt(0, templates.size() - 1)];
            }
            case NewsCategory::SUPPLY: {
                auto it = (sentiment == NewsSentiment::NEGATIVE) ? supplyNegative.find(symbol) :
                          (sentiment == NewsSentiment::POSITIVE) ? supplyPositive.find(symbol) : supplyPositive.end();
                if (it != supplyPositive.end() && !it->second.empty()) {
                    return it->second[Random::uniformInt(0, it->second.size() - 1)];
                }
                return displayName + " supply " + (sentiment == NewsSentiment::NEGATIVE ? "disrupted" : "improved");
            }
            case NewsCategory::DEMAND: {
                auto it = (sentiment == NewsSentiment::POSITIVE) ? demandPositive.find(symbol) :
                          (sentiment == NewsSentiment::NEGATIVE) ? demandNegative.find(symbol) : demandPositive.end();
                if (it != demandPositive.end() && !it->second.empty()) {
                    return it->second[Random::uniformInt(0, it->second.size() - 1)];
                }
                return displayName + " demand " + (sentiment == NewsSentiment::POSITIVE ? "surges" : "weakens");
            }
        }

        return "Commodity market update";
    }

} // namespace market
