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
            double supplyImpactStd = 0.05,
            double demandImpactStd = 0.05);

        void setCommodities(const std::vector<std::string>& symbols);
        void setCommodityNames(const std::map<std::string, std::string>& symbolToName);
        void setCommodityCategories(const std::map<std::string, std::string>& symbolToCategory);

        std::vector<NewsEvent> generate(Timestamp currentTime, double tickScale = 1.0);

        void injectNews(const NewsEvent& news);
        void injectGlobalNews(NewsSentiment sentiment, double magnitude, const std::string& headline);
        void injectSupplyNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline);
        void injectDemandNews(const std::string& symbol, NewsSentiment sentiment, double magnitude, const std::string& headline);

        std::vector<NewsEvent> getInjectedNews();
        std::vector<NewsEvent> getRecentNews(size_t count = 5) const;
        void addToRecent(const NewsEvent& news);

        const std::vector<NewsEvent>& getNewsHistory() const { return newsHistory_; }
        void clearNewsHistory() { newsHistory_.clear(); }

        void setLambda(double lambda) { lambda_ = lambda; }
        void setGlobalImpactStd(double std) { globalImpactStd_ = std; }
        void setSupplyImpactStd(double std) { supplyImpactStd_ = std; }
        void setDemandImpactStd(double std) { demandImpactStd_ = std; }
        void setPoliticalImpactStd(double std) { politicalImpactStd_ = std; }

    private:
        double lambda_;
        double globalImpactStd_;
        double politicalImpactStd_ = 0.025;
        double supplyImpactStd_;
        double demandImpactStd_;

        std::vector<std::string> symbols_;
        std::map<std::string, std::string> symbolToName_;
        std::map<std::string, std::string> symbolToCategory_;

        std::vector<NewsEvent> injectedNews_;
        std::vector<NewsEvent> recentNews_;
        std::vector<NewsEvent> newsHistory_;
        static constexpr size_t MAX_RECENT = 20;
        static constexpr size_t MAX_HISTORY = 50000;

        NewsEvent generateGlobalNews(Timestamp time);
        NewsEvent generatePoliticalNews(Timestamp time);
        NewsEvent generateSupplyNews(Timestamp time);
        NewsEvent generateDemandNews(Timestamp time);

        std::string generateHeadline(NewsCategory category, NewsSentiment sentiment,
            const std::string& symbol, const std::string& name);
    };

} // namespace market
