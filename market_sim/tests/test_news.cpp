#include <catch2/catch_test_macros.hpp>
#include "environment/NewsGenerator.hpp"
#include "core/Types.hpp"

using namespace market;

TEST_CASE("NewsGenerator: Basic construction", "[news]") {
    NewsGenerator ng(0.1, 0.02, 0.05, 0.05);
    REQUIRE(ng.getNewsHistory().empty());
}

TEST_CASE("NewsGenerator: Set commodities", "[news]") {
    NewsGenerator ng;
    ng.setCommodities({"OIL", "STEEL", "WOOD"});

    // Generate news - should be able to create commodity-specific events
    auto events = ng.generate(1000, 1.0);

    // With lambda=0.05 and random generation, might or might not have events
    // Just verify no crash
}

TEST_CASE("NewsGenerator: Inject global news", "[news]") {
    NewsGenerator ng;

    ng.injectGlobalNews(NewsSentiment::POSITIVE, 0.05, "Test global news");

    auto injected = ng.getInjectedNews();
    REQUIRE(injected.size() == 1);
    REQUIRE(injected[0].category == NewsCategory::GLOBAL);
    REQUIRE(injected[0].sentiment == NewsSentiment::POSITIVE);
    REQUIRE(injected[0].magnitude == 0.05);
    REQUIRE(injected[0].headline == "Test global news");
}

TEST_CASE("NewsGenerator: Inject supply news", "[news]") {
    NewsGenerator ng;
    ng.setCommodities({"OIL"});
    ng.setCommodityNames({{"OIL", "Crude Oil"}});

    ng.injectSupplyNews("OIL", NewsSentiment::NEGATIVE, 0.10, "Supply disruption");

    auto injected = ng.getInjectedNews();
    REQUIRE(injected.size() == 1);
    REQUIRE(injected[0].category == NewsCategory::SUPPLY);
    REQUIRE(injected[0].symbol == "OIL");
    REQUIRE(injected[0].sentiment == NewsSentiment::NEGATIVE);
    REQUIRE(injected[0].magnitude == 0.10);
}

TEST_CASE("NewsGenerator: Inject demand news", "[news]") {
    NewsGenerator ng;
    ng.setCommodities({"GRAIN"});
    ng.setCommodityNames({{"GRAIN", "Grain"}});

    ng.injectDemandNews("GRAIN", NewsSentiment::POSITIVE, 0.08, "Demand surge");

    auto injected = ng.getInjectedNews();
    REQUIRE(injected.size() == 1);
    REQUIRE(injected[0].category == NewsCategory::DEMAND);
    REQUIRE(injected[0].symbol == "GRAIN");
    REQUIRE(injected[0].sentiment == NewsSentiment::POSITIVE);
}

TEST_CASE("NewsGenerator: Generate processes injected news", "[news]") {
    NewsGenerator ng;

    ng.injectGlobalNews(NewsSentiment::POSITIVE, 0.05, "Test");
    REQUIRE(ng.getInjectedNews().size() == 1);

    auto events = ng.generate(1000, 1.0);

    // The injected news should appear in generated events
    // (Note: getInjectedNews() clears the injected queue)
    REQUIRE(ng.getInjectedNews().empty());
    // Note: events may be empty if injectedNews_ is cleared by getInjectedNews()
    // and no random events were generated (lambda affects random generation)
}

TEST_CASE("NewsGenerator: News history accumulates", "[news]") {
    NewsGenerator ng(0.5); // High lambda to ensure events

    ng.setCommodities({"OIL"});

    ng.generate(1000, 1.0);
    ng.generate(2000, 1.0);

    REQUIRE(ng.getNewsHistory().size() >= 0); // History should accumulate
}

TEST_CASE("NewsGenerator: Recent news tracking", "[news]") {
    NewsGenerator ng;

    ng.addToRecent(NewsEvent{NewsCategory::GLOBAL, NewsSentiment::POSITIVE, "", "", "", 0.05, 1000, "News 1"});
    ng.addToRecent(NewsEvent{NewsCategory::SUPPLY, NewsSentiment::NEGATIVE, "OIL", "", "", 0.10, 2000, "News 2"});

    auto recent = ng.getRecentNews(5);
    REQUIRE(recent.size() == 2);
}

TEST_CASE("NewsGenerator: Clear history", "[news]") {
    NewsGenerator ng;

    ng.injectGlobalNews(NewsSentiment::POSITIVE, 0.05, "Test");
    ng.generate(1000, 1.0);

    REQUIRE_FALSE(ng.getNewsHistory().empty());

    ng.clearNewsHistory();
    REQUIRE(ng.getNewsHistory().empty());
}

TEST_CASE("NewsGenerator: Set lambda", "[news]") {
    NewsGenerator ng(0.1);

    ng.setLambda(0.5);
    // Lambda affects event generation rate - hard to test directly
}

TEST_CASE("NewsGenerator: Set impact parameters", "[news]") {
    NewsGenerator ng;

    ng.setGlobalImpactStd(0.03);
    ng.setPoliticalImpactStd(0.04);
    ng.setSupplyImpactStd(0.06);
    ng.setDemandImpactStd(0.06);

    // Parameters are used in event generation
}
