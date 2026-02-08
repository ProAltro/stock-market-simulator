#pragma once

#include "core/Types.hpp"
#include <vector>
#include <string>
#include <map>

namespace market {

    class NewsGenerator {
    public:
        NewsGenerator(double lambda = 0.1,
            double globalImpactStd = 0.02,
            double industryImpactStd = 0.03,
            double companyImpactStd = 0.05);

        // Set available industries and symbols
        void setIndustries(const std::vector<std::string>& industries);
        void setSymbols(const std::map<std::string, std::string>& symbolToIndustry);

        // Set symbol names and market caps for headline generation and weighting
        void setSymbolNames(const std::map<std::string, std::string>& symbolToName);
        void setSymbolMarketCaps(const std::map<std::string, double>& symbolToMarketCap);
        void setSymbolSectorDetails(const std::map<std::string, std::string>& symbolToSector);

        // Generate news events for this tick
        std::vector<NewsEvent> generate(Timestamp currentTime, double tickScale = 1.0);

        // Inject custom news (from dashboard)
        void injectNews(const NewsEvent& news);
        void injectGlobalNews(NewsSentiment sentiment, double magnitude, const std::string& headline);
        void injectIndustryNews(const std::string& industry, NewsSentiment sentiment, double magnitude, const std::string& headline);
        void injectCompanyNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline);

        // Get pending injected news
        std::vector<NewsEvent> getInjectedNews();

        // Get recent news for streaming
        std::vector<NewsEvent> getRecentNews(size_t count = 5) const;
        void addToRecent(const NewsEvent& news);

        // Get all news history (for populate mode sync)
        const std::vector<NewsEvent>& getNewsHistory() const { return newsHistory_; }
        void clearNewsHistory() { newsHistory_.clear(); }

        // Update parameters
        void setLambda(double lambda) { lambda_ = lambda; }
        void setGlobalImpactStd(double std) { globalImpactStd_ = std; }
        void setIndustryImpactStd(double std) { industryImpactStd_ = std; }
        void setCompanyImpactStd(double std) { companyImpactStd_ = std; }
        void setPoliticalImpactStd(double std) { politicalImpactStd_ = std; }

    private:
        double lambda_;                  // Poisson arrival rate
        double globalImpactStd_;
        double politicalImpactStd_ = 0.025;
        double industryImpactStd_;
        double companyImpactStd_;

        std::vector<std::string> industries_;
        std::map<std::string, std::string> symbolToIndustry_;
        std::map<std::string, std::string> symbolToName_;
        std::map<std::string, double> symbolToMarketCap_;
        std::map<std::string, std::string> symbolToSector_;
        std::vector<std::string> symbols_;

        std::vector<NewsEvent> injectedNews_;
        std::vector<NewsEvent> recentNews_;
        std::vector<NewsEvent> newsHistory_;  // Larger buffer for sync
        static constexpr size_t MAX_RECENT = 20;
        static constexpr size_t MAX_HISTORY = 50000;

        NewsEvent generateGlobalNews(Timestamp time);
        NewsEvent generatePoliticalNews(Timestamp time);
        NewsEvent generateIndustryNews(Timestamp time);
        NewsEvent generateCompanyNews(Timestamp time);

        // Select a company weighted by market cap
        std::string selectWeightedSymbol() const;

        std::string generateHeadline(NewsCategory category, NewsSentiment sentiment,
            const std::string& target, const std::string& name = "",
            const std::string& sector = "");
    };

} // namespace market
