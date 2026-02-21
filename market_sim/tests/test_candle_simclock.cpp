#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "core/CandleAggregator.hpp"
#include "core/SimClock.hpp"

using namespace market;

// ============================================================
// CandleAggregator Unit Tests
// ============================================================

TEST_CASE("CandleAggregator: Default construction", "[candle]") {
    CandleAggregator agg;
    // Should not crash; no symbols registered yet
    auto candles = agg.getCandles("OIL", CandleAggregator::Interval::M1);
    REQUIRE(candles.empty());
}

TEST_CASE("CandleAggregator: addSymbol registers all intervals", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);

    agg.addSymbol("OIL");

    // After adding a symbol, getCandleCount should return 0 for all intervals
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M1) == 0);
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M5) == 0);
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M15) == 0);
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M30) == 0);
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::H1) == 0);
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::D1) == 0);
}

TEST_CASE("CandleAggregator: unknown symbol returns empty", "[candle]") {
    CandleAggregator agg;
    auto candles = agg.getCandles("UNKNOWN", CandleAggregator::Interval::M1);
    REQUIRE(candles.empty());
    REQUIRE(agg.getCandleCount("UNKNOWN", CandleAggregator::Interval::M1) == 0);
}

TEST_CASE("CandleAggregator: single tick creates current candle", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp time = clock.getSimTime();
    agg.onTick("OIL", 75.0, 100.0, time);

    Candle current = agg.getCurrentCandle("OIL", CandleAggregator::Interval::M1);
    REQUIRE(current.open == 75.0);
    REQUIRE(current.high == 75.0);
    REQUIRE(current.low == 75.0);
    REQUIRE(current.close == 75.0);
    REQUIRE(current.volume == 100.0);
}

TEST_CASE("CandleAggregator: multiple ticks update OHLCV", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp time = clock.getSimTime();

    agg.onTick("OIL", 75.0, 100.0, time);
    agg.onTick("OIL", 76.0, 200.0, time);   // Same time bucket
    agg.onTick("OIL", 73.0, 150.0, time);
    agg.onTick("OIL", 74.5, 80.0, time);

    Candle current = agg.getCurrentCandle("OIL", CandleAggregator::Interval::M1);
    REQUIRE(current.open == 75.0);
    REQUIRE(current.high == 76.0);
    REQUIRE(current.low == 73.0);
    REQUIRE(current.close == 74.5);
    REQUIRE_THAT(current.volume, Catch::Matchers::WithinRel(530.0, 0.01));
}

TEST_CASE("CandleAggregator: new candle period closes previous", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000; // 1 minute

    // First candle
    agg.onTick("OIL", 75.0, 100.0, base);
    agg.onTick("OIL", 76.0, 200.0, base);

    // Jump to next minute boundary
    Timestamp nextMinute = base + ms1m;
    agg.onTick("OIL", 77.0, 150.0, nextMinute);

    // Previous candle should be completed
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M1) == 1);

    auto candles = agg.getCandles("OIL", CandleAggregator::Interval::M1);
    REQUIRE(candles.size() == 1);
    REQUIRE(candles[0].open == 75.0);
    REQUIRE(candles[0].high == 76.0);
    REQUIRE(candles[0].close == 76.0);
}

TEST_CASE("CandleAggregator: multiple completed candles", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;

    for (int i = 0; i < 5; i++) {
        Timestamp time = base + i * ms1m;
        agg.onTick("OIL", 75.0 + i, 100.0, time);
    }

    // 4 completed + 1 current in progress
    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M1) == 4);
}

TEST_CASE("CandleAggregator: getCandles with limit", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;

    for (int i = 0; i < 10; i++) {
        agg.onTick("OIL", 75.0, 100.0, base + i * ms1m);
    }

    auto limited = agg.getCandles("OIL", CandleAggregator::Interval::M1, 0, 3);
    REQUIRE(limited.size() == 3);
}

TEST_CASE("CandleAggregator: getCandles with since filter", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;

    for (int i = 0; i < 10; i++) {
        agg.onTick("OIL", 75.0, 100.0, base + i * ms1m);
    }

    Timestamp since = base + 5 * ms1m;
    auto filtered = agg.getCandles("OIL", CandleAggregator::Interval::M1, since, 500);
    for (const auto& c : filtered) {
        REQUIRE(c.time >= since);
    }
}

TEST_CASE("CandleAggregator: getAllCandles returns all symbols", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");
    agg.addSymbol("STEEL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;

    agg.onTick("OIL", 75.0, 100.0, base);
    agg.onTick("STEEL", 120.0, 200.0, base);
    agg.onTick("OIL", 76.0, 100.0, base + ms1m);
    agg.onTick("STEEL", 121.0, 200.0, base + ms1m);

    auto all = agg.getAllCandles(CandleAggregator::Interval::M1);
    REQUIRE(all.count("OIL") == 1);
    REQUIRE(all.count("STEEL") == 1);
}

TEST_CASE("CandleAggregator: reset clears all data", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    agg.onTick("OIL", 75.0, 100.0, clock.getSimTime());
    agg.reset();

    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M1) == 0);
    auto candles = agg.getCandles("OIL", CandleAggregator::Interval::M1);
    REQUIRE(candles.empty());
}

TEST_CASE("CandleAggregator: intervalToString", "[candle]") {
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::M1) == "1m");
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::M5) == "5m");
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::M15) == "15m");
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::M30) == "30m");
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::H1) == "1h");
    REQUIRE(CandleAggregator::intervalToString(CandleAggregator::Interval::D1) == "1d");
}

TEST_CASE("CandleAggregator: parseInterval", "[candle]") {
    REQUIRE(CandleAggregator::parseInterval("1m") == CandleAggregator::Interval::M1);
    REQUIRE(CandleAggregator::parseInterval("M1") == CandleAggregator::Interval::M1);
    REQUIRE(CandleAggregator::parseInterval("5m") == CandleAggregator::Interval::M5);
    REQUIRE(CandleAggregator::parseInterval("M5") == CandleAggregator::Interval::M5);
    REQUIRE(CandleAggregator::parseInterval("15m") == CandleAggregator::Interval::M15);
    REQUIRE(CandleAggregator::parseInterval("30m") == CandleAggregator::Interval::M30);
    REQUIRE(CandleAggregator::parseInterval("1h") == CandleAggregator::Interval::H1);
    REQUIRE(CandleAggregator::parseInterval("H1") == CandleAggregator::Interval::H1);
    REQUIRE(CandleAggregator::parseInterval("1d") == CandleAggregator::Interval::D1);
    REQUIRE(CandleAggregator::parseInterval("D1") == CandleAggregator::Interval::D1);

    // Unknown string defaults to D1
    REQUIRE(CandleAggregator::parseInterval("unknown") == CandleAggregator::Interval::D1);
}

TEST_CASE("CandleAggregator: getIntervalMs", "[candle]") {
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::M1) == 60000);
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::M5) == 300000);
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::M15) == 900000);
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::M30) == 1800000);
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::H1) == 3600000);
    REQUIRE(CandleAggregator::getIntervalMs(CandleAggregator::Interval::D1) == 86400000);
}

TEST_CASE("CandleAggregator: 5-minute candle aggregation", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;
    Timestamp ms5m = 300000;

    // Feed ticks across 6 minutes (should create 1 completed 5m candle)
    for (int i = 0; i < 6; i++) {
        agg.onTick("OIL", 75.0 + i * 0.1, 100.0, base + i * ms1m);
    }

    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::M5) == 1);
}

TEST_CASE("CandleAggregator: daily candle aggregation", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp msDay = 86400000;

    // Feed ticks across 2 days
    agg.onTick("OIL", 75.0, 100.0, base);
    agg.onTick("OIL", 80.0, 200.0, base);
    agg.onTick("OIL", 70.0, 150.0, base);    // Same day
    agg.onTick("OIL", 77.0, 300.0, base + msDay); // Next day

    REQUIRE(agg.getCandleCount("OIL", CandleAggregator::Interval::D1) == 1);
    auto candles = agg.getCandles("OIL", CandleAggregator::Interval::D1);
    REQUIRE(candles.size() == 1);
    REQUIRE(candles[0].open == 75.0);
    REQUIRE(candles[0].high == 80.0);
    REQUIRE(candles[0].low == 70.0);
    REQUIRE(candles[0].close == 70.0); // Last tick of the day
}

TEST_CASE("CandleAggregator: ignores unknown symbol ticks", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    // Tick for unregistered symbol should be silently ignored
    agg.onTick("GOLD", 1800.0, 500.0, clock.getSimTime());

    auto candles = agg.getCandles("GOLD", CandleAggregator::Interval::M1);
    REQUIRE(candles.empty());
}

TEST_CASE("CandleAggregator: candles in chronological order", "[candle]") {
    CandleAggregator agg;
    SimClock clock;
    clock.initialize("2025-01-01", 72000);
    agg.initialize(&clock);
    agg.addSymbol("OIL");

    Timestamp base = clock.getSimTime();
    Timestamp ms1m = 60000;

    for (int i = 0; i < 10; i++) {
        agg.onTick("OIL", 75.0, 100.0, base + i * ms1m);
    }

    auto candles = agg.getCandles("OIL", CandleAggregator::Interval::M1);
    for (size_t i = 1; i < candles.size(); i++) {
        REQUIRE(candles[i].time > candles[i - 1].time);
    }
}
