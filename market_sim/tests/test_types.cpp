#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/Types.hpp"

using namespace market;
using Catch::Approx;

TEST_CASE("Types: Order can be created and assigned", "[types]") {
    Order order;
    order.id = 123;
    order.agentId = 456;
    order.price = 100.0;
    order.quantity = 10;

    REQUIRE(order.id == 123);
    REQUIRE(order.agentId == 456);
    REQUIRE(order.price == 100.0);
    REQUIRE(order.quantity == 10);
}

TEST_CASE("Types: Trade can be created and assigned", "[types]") {
    Trade trade;
    trade.price = 105.0;
    trade.quantity = 15;

    REQUIRE(trade.price == 105.0);
    REQUIRE(trade.quantity == 15);
}

TEST_CASE("Types: SupplyDemand total supply calculation", "[types]") {
    SupplyDemand sd;
    sd.production = 100.0;
    sd.imports = 50.0;
    sd.exports = 30.0;
    sd.inventory = 20.0;

    // Total supply = production + imports - exports + inventory = 100 + 50 - 30 + 20 = 140
    REQUIRE(sd.getTotalSupply() == 140.0);
}

TEST_CASE("Types: SupplyDemand total demand", "[types]") {
    SupplyDemand sd;
    sd.consumption = 150.0;

    REQUIRE(sd.getTotalDemand() == 150.0);
}

TEST_CASE("Types: SupplyDemand imbalance positive (demand > supply)", "[types]") {
    SupplyDemand sd;
    sd.production = 100.0;
    sd.imports = 0.0;
    sd.exports = 0.0;
    sd.inventory = 0.0;
    sd.consumption = 150.0;

    // Imbalance = (demand - supply) / demand = (150 - 100) / 150 = 0.333
    REQUIRE(sd.getImbalance() == Approx(0.333).epsilon(0.01));
}

TEST_CASE("Types: SupplyDemand imbalance negative (supply > demand)", "[types]") {
    SupplyDemand sd;
    sd.production = 200.0;
    sd.imports = 0.0;
    sd.exports = 0.0;
    sd.inventory = 0.0;
    sd.consumption = 150.0;

    // Imbalance = (demand - supply) / demand = (150 - 200) / 150 = -0.333
    REQUIRE(sd.getImbalance() == Approx(-0.333).epsilon(0.01));
}

TEST_CASE("Types: SupplyDemand imbalance zero when balanced", "[types]") {
    SupplyDemand sd;
    sd.production = 100.0;
    sd.consumption = 100.0;

    REQUIRE(sd.getImbalance() == 0.0);
}

TEST_CASE("Types: SupplyDemand imbalance zero with zero demand", "[types]") {
    SupplyDemand sd;
    sd.production = 100.0;
    sd.consumption = 0.0;

    REQUIRE(sd.getImbalance() == 0.0); // Guard against div by zero
}

TEST_CASE("Types: CrossEffect can be assigned", "[types]") {
    CrossEffect ce;
    ce.targetSymbol = "OIL";
    ce.coefficient = 0.25;
    
    REQUIRE(ce.targetSymbol == "OIL");
    REQUIRE(ce.coefficient == 0.25);
}

TEST_CASE("Types: Candle validation", "[types]") {
    Candle valid;
    valid.time = 1000;
    valid.open = 100.0;
    valid.high = 105.0;
    valid.low = 95.0;
    valid.close = 102.0;
    valid.volume = 1000.0;

    REQUIRE(valid.isValid());

    Candle invalid;
    invalid.time = 0;
    REQUIRE_FALSE(invalid.isValid());

    invalid.time = 1000;
    invalid.open = 0;
    REQUIRE_FALSE(invalid.isValid());
}

TEST_CASE("Types: AgentTypeStats defaults", "[types]") {
    AgentTypeStats stats;
    REQUIRE(stats.ordersPlaced == 0);
    REQUIRE(stats.buyOrders == 0);
    REQUIRE(stats.sellOrders == 0);
    REQUIRE(stats.fills == 0);
    REQUIRE(stats.volumeTraded == 0.0);
    REQUIRE(stats.cashSpent == 0.0);
    REQUIRE(stats.cashReceived == 0.0);
}

TEST_CASE("Types: OrderBookSnapshot can be assigned", "[types]") {
    OrderBookSnapshot snap;
    snap.bestBid = 99.0;
    snap.bestAsk = 101.0;
    snap.spread = 2.0;
    snap.midPrice = 100.0;

    REQUIRE(snap.bestBid == 99.0);
    REQUIRE(snap.bestAsk == 101.0);
    REQUIRE(snap.spread == 2.0);
    REQUIRE(snap.midPrice == 100.0);
    REQUIRE(snap.bids.empty());
    REQUIRE(snap.asks.empty());
}

TEST_CASE("Types: NewsEvent defaults", "[types]") {
    NewsEvent ne;
    REQUIRE(ne.magnitude == 0.0);
    REQUIRE(ne.timestamp == 0);
    REQUIRE(ne.symbol == "");
    REQUIRE(ne.headline == "");
}

TEST_CASE("Types: MarketState defaults", "[types]") {
    MarketState ms;
    REQUIRE(ms.globalSentiment == 0.0);
    REQUIRE(ms.tickScale == 1.0);
    REQUIRE(ms.currentTime == 0);
}

TEST_CASE("Types: now() returns valid timestamp", "[types]") {
    Timestamp t = now();
    REQUIRE(t > 0);
    REQUIRE(t < 9999999999999); // Reasonable range
}
