#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/Commodity.hpp"
#include "core/Types.hpp"

using namespace market;
using Catch::Approx;

TEST_CASE("Commodity: Basic construction", "[commodity]") {
    Commodity c("OIL", "Crude Oil", "Energy", 75.0);

    REQUIRE(c.getSymbol() == "OIL");
    REQUIRE(c.getName() == "Crude Oil");
    REQUIRE(c.getCategory() == "Energy");
    REQUIRE(c.getPrice() == 75.0);
    REQUIRE(c.getDailyVolume() == 0);
}

TEST_CASE("Commodity: Construction with supply/demand params", "[commodity]") {
    Commodity c("STEEL", "Steel", "Construction", 120.0, 80.0, 100.0, 0.02, 40.0);

    REQUIRE(c.getPrice() == 120.0);

    auto& sd = c.getSupplyDemand();
    REQUIRE(sd.production == 80.0);
    REQUIRE(sd.consumption == 100.0);
    REQUIRE(sd.inventory == 40.0);
}

TEST_CASE("Commodity: Price setting", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    c.setPrice(105.0);
    REQUIRE(c.getPrice() == 105.0);

    c.setPrice(95.0);
    REQUIRE(c.getPrice() == 95.0);
}

TEST_CASE("Commodity: Price floor prevents zero/negative prices", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);
    c.setPriceFloor(0.01);

    c.setPrice(0.0);
    REQUIRE(c.getPrice() == 0.01);

    c.setPrice(-10.0);
    REQUIRE(c.getPrice() == 0.01);
}

TEST_CASE("Commodity: Price history tracking", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    c.setPrice(101.0);
    c.setPrice(102.0);
    c.setPrice(103.0);

    const auto& history = c.getPriceHistory();
    REQUIRE(history.size() == 4); // Initial + 3 updates
    REQUIRE(history.back() == 103.0);
}

TEST_CASE("Commodity: Returns calculation", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    c.setPrice(101.0);
    c.setPrice(102.0);
    c.setPrice(103.0);
    c.setPrice(104.0);  // Need 5 prices for getReturn(3) to work

    // Return from 101 to 104 = 3/101 ≈ 0.0297
    // history: [100, 101, 102, 103, 104], idx = 5 - 3 - 1 = 1
    // return = (104 - 101) / 101 ≈ 0.0297
    double ret = c.getReturn(3);
    REQUIRE(ret == Approx(0.0297).epsilon(0.01));
}

TEST_CASE("Commodity: Zero return with insufficient history", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    REQUIRE(c.getReturn(5) == 0.0); // Only 1 price point
}

TEST_CASE("Commodity: Supply demand imbalance calculation", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    auto& sd = c.getMutableSupplyDemand();
    sd.production = 100.0;
    sd.consumption = 120.0; // More demand than supply
    sd.imports = 0.0;
    sd.exports = 0.0;
    sd.inventory = 0.0;

    // Imbalance = (demand - supply) / demand = (120 - 100) / 120 = 0.1667
    double imbalance = sd.getImbalance();
    REQUIRE(imbalance == Approx(0.1667).epsilon(0.01));
}

TEST_CASE("Commodity: Supply demand with balanced market", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    auto& sd = c.getMutableSupplyDemand();
    sd.production = 100.0;
    sd.consumption = 100.0;
    sd.imports = 0.0;
    sd.exports = 0.0;
    sd.inventory = 0.0;  // Must set to 0 for true balance

    REQUIRE(sd.getImbalance() == Approx(0.0).epsilon(0.001));
}

TEST_CASE("Commodity: Supply demand with imports/exports", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    auto& sd = c.getMutableSupplyDemand();
    sd.production = 100.0;
    sd.imports = 20.0;
    sd.exports = 10.0;
    sd.inventory = 50.0;
    sd.consumption = 150.0;

    // Total supply = 100 + 20 - 10 + 50 = 160
    // Demand = 150
    // Imbalance = (150 - 160) / 150 = -0.0667 (oversupply)
    double imbalance = sd.getImbalance();
    REQUIRE(imbalance == Approx(-0.0667).epsilon(0.01));
}

TEST_CASE("Commodity: Apply supply shock", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    double initialProduction = c.getSupplyDemand().production;
    c.applySupplyShock(-0.2); // 20% reduction

    REQUIRE(c.getSupplyDemand().production == Approx(initialProduction * 0.8).epsilon(0.01));
}

TEST_CASE("Commodity: Apply positive supply shock", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    double initialProduction = c.getSupplyDemand().production;
    c.applySupplyShock(0.3); // 30% increase

    REQUIRE(c.getSupplyDemand().production == Approx(initialProduction * 1.3).epsilon(0.01));
}

TEST_CASE("Commodity: Apply demand shock", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    double initialConsumption = c.getSupplyDemand().consumption;
    c.applyDemandShock(0.25); // 25% increase

    REQUIRE(c.getSupplyDemand().consumption == Approx(initialConsumption * 1.25).epsilon(0.01));
}

TEST_CASE("Commodity: Apply negative demand shock", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    double initialConsumption = c.getSupplyDemand().consumption;
    c.applyDemandShock(-0.15); // 15% decrease

    REQUIRE(c.getSupplyDemand().consumption == Approx(initialConsumption * 0.85).epsilon(0.01));
}

TEST_CASE("Commodity: Circuit breaker limits daily move", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);
    c.setMaxDailyMove(0.10); // 10% max
    c.markDayOpen(); // Sets dayOpenPrice_ = 100.0

    c.setPrice(115.0); // 15% up - should be capped at 10%
    REQUIRE(c.getPrice() == Approx(110.0).epsilon(0.001));
    REQUIRE(c.isCircuitBroken());

    c.resetCircuitBreaker();
    REQUIRE_FALSE(c.isCircuitBroken());
}

TEST_CASE("Commodity: Circuit breaker on downside", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);
    c.setMaxDailyMove(0.10);
    c.markDayOpen();

    c.setPrice(85.0); // 15% down - should be capped at 10%
    REQUIRE(c.getPrice() == Approx(90.0).epsilon(0.001));
    REQUIRE(c.isCircuitBroken());
}

TEST_CASE("Commodity: Trade price impact with dampening", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);
    c.setImpactDampening(0.5); // 50% blend

    c.applyTradePrice(110.0, 10);

    // Blended price = 100 * 0.5 + 110 * 0.5 = 105
    REQUIRE(c.getPrice() == Approx(105.0).epsilon(0.001));
}

TEST_CASE("Commodity: Daily volume accumulation", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    c.addVolume(100);
    c.addVolume(50);

    REQUIRE(c.getDailyVolume() == 150);

    c.resetDailyVolume();
    REQUIRE(c.getDailyVolume() == 0);
}

TEST_CASE("Commodity: Volatility estimate", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0);

    // Create some price movement
    for (int i = 0; i < 25; ++i) {
        c.setPrice(100.0 + (i % 2 == 0 ? 1.0 : -1.0));
    }

    double vol = c.getVolatilityEstimate(20);
    REQUIRE(vol > 0.0);
}

TEST_CASE("Commodity: Supply/demand update applies decay", "[commodity]") {
    Commodity c("TEST", "Test", "General", 100.0, 100.0, 100.0);

    // Apply a shock first
    c.getMutableSupplyDemand().production = 150.0;
    c.getMutableSupplyDemand().consumption = 150.0;

    double beforeProd = c.getSupplyDemand().production;
    double beforeCons = c.getSupplyDemand().consumption;

    c.updateSupplyDemand(1.0);

    // Should have decayed toward base values (100.0)
    REQUIRE(c.getSupplyDemand().production < beforeProd);
    REQUIRE(c.getSupplyDemand().consumption < beforeCons);
}
