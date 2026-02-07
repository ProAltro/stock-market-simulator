#include "NewsGenerator.hpp"
#include "utils/Random.hpp"
#include <cmath>
#include <numeric>

namespace market {

    NewsGenerator::NewsGenerator(double lambda,
        double globalImpactStd,
        double industryImpactStd,
        double companyImpactStd)
        : lambda_(lambda)
        , globalImpactStd_(globalImpactStd)
        , industryImpactStd_(industryImpactStd)
        , companyImpactStd_(companyImpactStd)
    {
    }

    void NewsGenerator::setIndustries(const std::vector<std::string>& industries) {
        industries_ = industries;
    }

    void NewsGenerator::setSymbols(const std::map<std::string, std::string>& symbolToIndustry) {
        symbolToIndustry_ = symbolToIndustry;
        symbols_.clear();
        for (const auto& [symbol, _] : symbolToIndustry) {
            symbols_.push_back(symbol);
        }
    }

    void NewsGenerator::setSymbolNames(const std::map<std::string, std::string>& symbolToName) {
        symbolToName_ = symbolToName;
    }

    void NewsGenerator::setSymbolMarketCaps(const std::map<std::string, double>& symbolToMarketCap) {
        symbolToMarketCap_ = symbolToMarketCap;
    }

    void NewsGenerator::setSymbolSectorDetails(const std::map<std::string, std::string>& symbolToSector) {
        symbolToSector_ = symbolToSector;
    }

    std::string NewsGenerator::selectWeightedSymbol() const {
        if (symbols_.empty()) return "";
        if (symbolToMarketCap_.empty()) {
            return symbols_[Random::uniformInt(0, symbols_.size() - 1)];
        }

        // Weight by sqrt(marketCap) so large-caps get more news but not overwhelmingly
        double totalWeight = 0;
        std::vector<double> weights;
        for (const auto& s : symbols_) {
            auto it = symbolToMarketCap_.find(s);
            double cap = (it != symbolToMarketCap_.end()) ? it->second : 1e9;
            double w = std::sqrt(cap);
            weights.push_back(w);
            totalWeight += w;
        }

        double r = Random::uniform(0, totalWeight);
        double cumulative = 0;
        for (size_t i = 0; i < symbols_.size(); ++i) {
            cumulative += weights[i];
            if (r <= cumulative) return symbols_[i];
        }
        return symbols_.back();
    }

    std::vector<NewsEvent> NewsGenerator::generate(Timestamp currentTime) {
        std::vector<NewsEvent> events;

        // Add any injected news first
        auto injected = getInjectedNews();
        for (auto& news : injected) {
            news.timestamp = currentTime;
            events.push_back(news);
        }

        // Generate random news based on Poisson process
        int numEvents = Random::poisson(lambda_);

        for (int i = 0; i < numEvents; ++i) {
            double r = Random::uniform(0, 1);

            if (r < 0.15) {
                // 15% global economic news
                events.push_back(generateGlobalNews(currentTime));
            }
            else if (r < 0.25) {
                // 10% political news
                events.push_back(generatePoliticalNews(currentTime));
            }
            else if (r < 0.55) {
                // 30% industry news
                if (!industries_.empty()) {
                    events.push_back(generateIndustryNews(currentTime));
                }
            }
            else {
                // 45% company news
                if (!symbols_.empty()) {
                    events.push_back(generateCompanyNews(currentTime));
                }
            }
        }

        // Store in history
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
        news.headline = headline.empty() ? generateHeadline(NewsCategory::GLOBAL, sentiment, "Market") : headline;
        news.timestamp = 0;
        injectedNews_.push_back(news);
    }

    void NewsGenerator::injectIndustryNews(const std::string& industry, NewsSentiment sentiment, double magnitude, const std::string& headline) {
        NewsEvent news;
        news.category = NewsCategory::INDUSTRY;
        news.industry = industry;
        news.sentiment = sentiment;
        news.magnitude = magnitude;
        news.headline = headline.empty() ? generateHeadline(NewsCategory::INDUSTRY, sentiment, industry) : headline;
        news.timestamp = 0;
        injectedNews_.push_back(news);
    }

    void NewsGenerator::injectCompanyNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline) {
        NewsEvent news;
        news.category = NewsCategory::COMPANY;
        news.symbol = symbol;
        auto it = symbolToIndustry_.find(symbol);
        if (it != symbolToIndustry_.end()) news.industry = it->second;
        auto nameIt = symbolToName_.find(symbol);
        if (nameIt != symbolToName_.end()) news.companyName = nameIt->second;
        news.sentiment = sentiment;
        news.magnitude = magnitude;
        news.headline = headline.empty() ? generateHeadline(NewsCategory::COMPANY, sentiment, symbol,
            news.companyName) : headline;
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
        if (r < 0.35) {
            news.sentiment = NewsSentiment::POSITIVE;
        }
        else if (r < 0.7) {
            news.sentiment = NewsSentiment::NEGATIVE;
        }
        else {
            news.sentiment = NewsSentiment::NEUTRAL;
        }

        news.magnitude = std::abs(Random::normal(0, globalImpactStd_));
        news.subcategory = "economic";
        news.headline = generateHeadline(NewsCategory::GLOBAL, news.sentiment, "Market");

        return news;
    }

    NewsEvent NewsGenerator::generatePoliticalNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::POLITICAL;
        news.timestamp = time;

        double r = Random::uniform(0, 1);
        if (r < 0.30) {
            news.sentiment = NewsSentiment::POSITIVE;
        }
        else if (r < 0.65) {
            news.sentiment = NewsSentiment::NEGATIVE;
        }
        else {
            news.sentiment = NewsSentiment::NEUTRAL;
        }

        news.magnitude = std::abs(Random::normal(0, politicalImpactStd_));
        news.subcategory = "political";
        news.headline = generateHeadline(NewsCategory::POLITICAL, news.sentiment, "");

        return news;
    }

    NewsEvent NewsGenerator::generateIndustryNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::INDUSTRY;
        news.timestamp = time;
        news.industry = industries_[Random::uniformInt(0, industries_.size() - 1)];

        double r = Random::uniform(0, 1);
        if (r < 0.4) {
            news.sentiment = NewsSentiment::POSITIVE;
        }
        else if (r < 0.8) {
            news.sentiment = NewsSentiment::NEGATIVE;
        }
        else {
            news.sentiment = NewsSentiment::NEUTRAL;
        }

        news.magnitude = std::abs(Random::normal(0, industryImpactStd_));
        news.subcategory = "sector";
        news.headline = generateHeadline(NewsCategory::INDUSTRY, news.sentiment, news.industry);

        return news;
    }

    NewsEvent NewsGenerator::generateCompanyNews(Timestamp time) {
        NewsEvent news;
        news.category = NewsCategory::COMPANY;
        news.timestamp = time;
        news.symbol = selectWeightedSymbol();

        auto it = symbolToIndustry_.find(news.symbol);
        if (it != symbolToIndustry_.end()) news.industry = it->second;

        auto nameIt = symbolToName_.find(news.symbol);
        if (nameIt != symbolToName_.end()) news.companyName = nameIt->second;

        std::string sectorDetail;
        auto secIt = symbolToSector_.find(news.symbol);
        if (secIt != symbolToSector_.end()) sectorDetail = secIt->second;

        double r = Random::uniform(0, 1);
        if (r < 0.4) {
            news.sentiment = NewsSentiment::POSITIVE;
        }
        else if (r < 0.8) {
            news.sentiment = NewsSentiment::NEGATIVE;
        }
        else {
            news.sentiment = NewsSentiment::NEUTRAL;
        }

        news.magnitude = std::abs(Random::normal(0, companyImpactStd_));

        // Pick subcategory based on industry
        std::vector<std::string> subcats = { "earnings", "guidance", "management", "product" };
        if (news.industry == "Healthcare") {
            subcats.push_back("fda_approval");
            subcats.push_back("clinical_trial");
        }
        else if (news.industry == "Technology") {
            subcats.push_back("product_launch");
            subcats.push_back("data_breach");
        }
        else if (news.industry == "Finance") {
            subcats.push_back("regulation");
            subcats.push_back("credit_rating");
        }
        else if (news.industry == "Energy") {
            subcats.push_back("oil_prices");
            subcats.push_back("environmental");
        }
        news.subcategory = subcats[Random::uniformInt(0, subcats.size() - 1)];

        news.headline = generateHeadline(NewsCategory::COMPANY, news.sentiment, news.symbol,
            news.companyName, sectorDetail);

        return news;
    }

    std::string NewsGenerator::generateHeadline(NewsCategory category, NewsSentiment sentiment,
        const std::string& target, const std::string& name,
        const std::string& sector) {
        // Use company name if available, otherwise symbol
        std::string displayName = name.empty() ? target : name;
        std::string tickerRef = name.empty() ? target : name + " (" + target + ")";

        // === GLOBAL HEADLINES ===
        std::vector<std::string> positiveGlobal = {
            "GDP growth exceeds forecasts, boosting market confidence",
            "Unemployment rate hits record low amid economic expansion",
            "Central bank holds rates steady, signals confidence in economy",
            "Consumer spending surges, driving retail sector gains",
            "Manufacturing PMI expansion accelerates to 18-month high",
            "Global trade volumes rise on easing supply chain pressures",
            "Business confidence index reaches multi-year high",
            "Retail sales beat expectations for third consecutive month",
            "Housing market shows resilience with steady price growth",
            "Corporate earnings season off to strong start"
        };

        std::vector<std::string> negativeGlobal = {
            "Inflation data comes in hotter than expected",
            "Trade deficit widens sharply on import surge",
            "Consumer confidence index plummets to two-year low",
            "Housing starts decline for third consecutive month",
            "Jobless claims rise unexpectedly, raising recession fears",
            "Central bank warns of persistent inflation risks",
            "Manufacturing sector contracts for first time in a year",
            "Yield curve inverts as bond markets signal caution",
            "Global growth forecast downgraded by international bodies",
            "Credit card delinquencies rise to decade-high levels"
        };

        std::vector<std::string> neutralGlobal = {
            "Markets trade sideways on mixed economic signals",
            "Fed minutes reveal divided opinions on rate trajectory",
            "Economic indicators paint mixed picture for coming quarter",
            "Analysts debate implications of latest jobs report",
            "Treasury yields stabilize after week of volatility",
            "Market breadth narrows as traders await key data releases"
        };

        // === POLITICAL HEADLINES ===
        std::vector<std::string> positivePolitical = {
            "New trade agreement boosts market confidence across sectors",
            "Government announces infrastructure stimulus package",
            "Regulatory clarity welcomed by investors and industry leaders",
            "Diplomatic breakthrough eases geopolitical tensions",
            "Bipartisan tax reform proposal lifts business outlook",
            "International summit produces cooperation framework",
            "New trade deal eliminates tariffs on key industrial goods",
            "Government unveils pro-business deregulation plans"
        };

        std::vector<std::string> negativePolitical = {
            "New tariffs threaten to disrupt supply chains",
            "Political instability rattles markets as coalition fractures",
            "Increased regulatory oversight concerns business leaders",
            "Geopolitical tensions escalate in key trade corridor",
            "Government shutdown looms as budget talks stall",
            "Sanctions expansion raises supply concerns for multiple sectors",
            "Trade war rhetoric intensifies between major economies",
            "Proposed tax increases weigh on corporate profit forecasts",
            "Political uncertainty clouds investment outlook"
        };

        std::vector<std::string> neutralPolitical = {
            "Lawmakers debate new industry oversight framework",
            "International trade talks continue without resolution",
            "Political transition period keeps markets watchful",
            "Congressional committee schedules hearings on market regulation",
            "Election polling shows tight race, markets await clarity"
        };

        // === INDUSTRY HEADLINES ===
        std::vector<std::string> positiveIndustry = {
            target + " sector sees strong demand cycle",
            "Bullish outlook for " + target + " industry as orders surge",
            target + " stocks rally on favorable regulatory developments",
            "Analysts upgrade " + target + " sector to overweight",
            "Supply chain improvements benefit " + target + " companies",
            target + " industry reports record quarterly revenues",
            "Innovation boom drives investment in " + target + " sector",
            "Institutional investors increase " + target + " sector allocation"
        };

        std::vector<std::string> negativeIndustry = {
            target + " sector faces headwinds from rising costs",
            "Concerns mount for " + target + " industry amid slowing demand",
            target + " stocks decline on tighter regulations",
            "Analysts downgrade " + target + " outlook citing margin pressure",
            target + " sector hit by supply shortages",
            "Competitive pressure intensifies across " + target + " industry",
            target + " companies warn of pricing pressure ahead",
            "Industry consolidation fears weigh on " + target + " valuations"
        };

        std::vector<std::string> neutralIndustry = {
            "Conference season brings mixed outlook for " + target,
            target + " sector trading volume spikes amid rebalancing",
            "Analysts maintain mixed ratings across " + target + " industry",
            target + " companies enter quiet period ahead of earnings"
        };

        // === COMPANY HEADLINES ===
        std::vector<std::string> positiveCompany = {
            tickerRef + " crushes quarterly earnings expectations",
            tickerRef + " announces strong forward guidance",
            tickerRef + " secures landmark multi-billion dollar contract",
            tickerRef + " reports record revenue growth of 25%",
            tickerRef + " announces major share buyback program",
            displayName + " expands into new high-growth markets",
            displayName + " receives analyst upgrade on strong fundamentals",
            tickerRef + " raises dividend by 15%, signaling confidence"
        };

        std::vector<std::string> negativeCompany = {
            tickerRef + " misses earnings expectations by wide margin",
            tickerRef + " lowers full-year guidance amid challenges",
            tickerRef + " faces class-action lawsuit from investors",
            displayName + " reports unexpected revenue decline",
            displayName + " CEO announces surprise departure",
            tickerRef + " faces regulatory investigation",
            displayName + " warns of significant margin compression",
            tickerRef + " loses key customer contract to competitor"
        };

        std::vector<std::string> neutralCompany = {
            tickerRef + " trading volume spikes amid market speculation",
            "Analysts maintain hold rating on " + displayName,
            displayName + " announces board restructuring",
            tickerRef + " enters quiet period ahead of earnings release",
            displayName + " schedules investor day presentation"
        };

        // Add sector-specific headlines for company news
        if (category == NewsCategory::COMPANY && !sector.empty()) {
            if (sector.find("Pharma") != std::string::npos || sector.find("Bio") != std::string::npos ||
                sector.find("mRNA") != std::string::npos || sector.find("Medical") != std::string::npos) {
                if (sentiment == NewsSentiment::POSITIVE) {
                    positiveCompany.push_back(displayName + " receives FDA fast-track designation");
                    positiveCompany.push_back(tickerRef + " Phase 3 trial meets primary endpoint");
                    positiveCompany.push_back(displayName + " drug candidate shows breakthrough results");
                }
                else if (sentiment == NewsSentiment::NEGATIVE) {
                    negativeCompany.push_back(displayName + " FDA application receives complete response letter");
                    negativeCompany.push_back(tickerRef + " clinical trial fails to meet primary endpoint");
                    negativeCompany.push_back(displayName + " faces generic competition on key drug");
                }
            }
            if (sector.find("Semiconductor") != std::string::npos || sector.find("AI") != std::string::npos ||
                sector.find("Software") != std::string::npos || sector.find("Cloud") != std::string::npos) {
                if (sentiment == NewsSentiment::POSITIVE) {
                    positiveCompany.push_back(displayName + " unveils next-gen product to strong reviews");
                    positiveCompany.push_back(tickerRef + " signs massive cloud infrastructure deal");
                }
                else if (sentiment == NewsSentiment::NEGATIVE) {
                    negativeCompany.push_back(displayName + " hit by major data breach affecting millions");
                    negativeCompany.push_back(tickerRef + " faces antitrust scrutiny from regulators");
                }
            }
            if (sector.find("Oil") != std::string::npos || sector.find("Energy") != std::string::npos ||
                sector.find("Renewable") != std::string::npos) {
                if (sentiment == NewsSentiment::POSITIVE) {
                    positiveCompany.push_back(displayName + " discovers major new resource deposit");
                    positiveCompany.push_back(tickerRef + " secures long-term energy supply contract");
                }
                else if (sentiment == NewsSentiment::NEGATIVE) {
                    negativeCompany.push_back(displayName + " faces environmental penalty from spill");
                    negativeCompany.push_back(tickerRef + " production disrupted by equipment failure");
                }
            }
            if (sector.find("Bank") != std::string::npos || sector.find("Fintech") != std::string::npos ||
                sector.find("Insurance") != std::string::npos) {
                if (sentiment == NewsSentiment::POSITIVE) {
                    positiveCompany.push_back(displayName + " reports strong loan growth and net interest margin");
                    positiveCompany.push_back(tickerRef + " passes stress test with flying colors");
                }
                else if (sentiment == NewsSentiment::NEGATIVE) {
                    negativeCompany.push_back(displayName + " increases loan loss provisions substantially");
                    negativeCompany.push_back(tickerRef + " faces scrutiny over lending practices");
                }
            }
        }

        std::vector<std::string>* templates = nullptr;

        switch (category) {
        case NewsCategory::GLOBAL:
            if (sentiment == NewsSentiment::POSITIVE) templates = &positiveGlobal;
            else if (sentiment == NewsSentiment::NEGATIVE) templates = &negativeGlobal;
            else templates = &neutralGlobal;
            break;
        case NewsCategory::POLITICAL:
            if (sentiment == NewsSentiment::POSITIVE) templates = &positivePolitical;
            else if (sentiment == NewsSentiment::NEGATIVE) templates = &negativePolitical;
            else templates = &neutralPolitical;
            break;
        case NewsCategory::INDUSTRY:
            if (sentiment == NewsSentiment::POSITIVE) templates = &positiveIndustry;
            else if (sentiment == NewsSentiment::NEGATIVE) templates = &negativeIndustry;
            else templates = &neutralIndustry;
            break;
        case NewsCategory::COMPANY:
            if (sentiment == NewsSentiment::POSITIVE) templates = &positiveCompany;
            else if (sentiment == NewsSentiment::NEGATIVE) templates = &negativeCompany;
            else templates = &neutralCompany;
            break;
        }

        if (templates && !templates->empty()) {
            return (*templates)[Random::uniformInt(0, templates->size() - 1)];
        }

        return "Market news update";
    }

} // namespace market
