#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "core/SimClock.hpp"

using namespace market;

// ============================================================
// SimClock Unit Tests
// ============================================================

TEST_CASE("SimClock: Default construction", "[simclock]") {
    SimClock clock;
    REQUIRE(clock.getTotalTicks() == 0);
    REQUIRE(clock.getTickInDay() == 0);
    REQUIRE(clock.getTicksPerDay() == 72000);
}

TEST_CASE("SimClock: Initialize with start date", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 72000);

    REQUIRE(clock.getTicksPerDay() == 72000);
    REQUIRE(clock.getTotalTicks() == 0);
    REQUIRE(clock.getTickInDay() == 0);
    REQUIRE(clock.getStartTime() > 0);
    REQUIRE(clock.getSimTime() == clock.getStartTime());
}

TEST_CASE("SimClock: Initialize with custom ticksPerDay", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 200);
    REQUIRE(clock.getTicksPerDay() == 200);
}

TEST_CASE("SimClock: Tick advances total ticks", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 72000);

    Timestamp t0 = clock.getSimTime();
    clock.tick();
    REQUIRE(clock.getTotalTicks() == 1);
    REQUIRE(clock.getSimTime() > t0);

    clock.tick();
    REQUIRE(clock.getTotalTicks() == 2);
}

TEST_CASE("SimClock: Tick advances simulated time", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 72000);

    Timestamp before = clock.getSimTime();
    clock.tick();
    Timestamp after = clock.getSimTime();

    // Each tick = 86400000ms / 72000 = 1200ms
    Timestamp expectedMs = static_cast<Timestamp>(86400000.0 / 72000);
    REQUIRE(after - before == expectedMs);
}

TEST_CASE("SimClock: tickInDay wraps at ticksPerDay", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 10); // Small ticks per day for testing

    for (int i = 0; i < 10; i++) {
        clock.tick();
    }
    // After 10 ticks (one full day), tickInDay should wrap to 0
    REQUIRE(clock.getTickInDay() == 0);
    REQUIRE(clock.getTotalTicks() == 10);
}

TEST_CASE("SimClock: isNewDay detection", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 5);

    // Not new day at start (totalTicks_ == 0)
    REQUIRE_FALSE(clock.isNewDay());

    // Advance through a full day
    for (int i = 0; i < 5; i++) {
        clock.tick();
    }
    // tickInDay should be 0 after wrapping, and totalTicks > 0
    REQUIRE(clock.isNewDay());

    // One more tick should not be a new day
    clock.tick();
    REQUIRE_FALSE(clock.isNewDay());
}

TEST_CASE("SimClock: getSimMsPerTick calculation", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 72000);

    double msPerTick = clock.getSimMsPerTick();
    REQUIRE_THAT(msPerTick, Catch::Matchers::WithinRel(1200.0, 0.01));

    // With populate rate
    SimClock clock2;
    clock2.initialize("2025-01-01", 200);
    double msPerTick2 = clock2.getSimMsPerTick();
    REQUIRE_THAT(msPerTick2, Catch::Matchers::WithinRel(432000.0, 0.01));
}

TEST_CASE("SimClock: getTickScale calculation", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 200);
    clock.setReferenceTicksPerDay(200);

    // At reference rate, scale should be 1.0
    REQUIRE_THAT(clock.getTickScale(), Catch::Matchers::WithinRel(1.0, 0.001));

    // At normal rate
    clock.setTicksPerDay(72000);
    double scale = clock.getTickScale();
    REQUIRE_THAT(scale, Catch::Matchers::WithinRel(200.0 / 72000.0, 0.001));
}

TEST_CASE("SimClock: getTickScale handles zero/negative", "[simclock]") {
    SimClock clock;

    clock.setTicksPerDay(0);
    REQUIRE(clock.getTickScale() == 1.0);

    clock.setReferenceTicksPerDay(0);
    REQUIRE(clock.getTickScale() == 1.0);
}

TEST_CASE("SimClock: setSimTime", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01");

    Timestamp custom = 1700000000000;
    clock.setSimTime(custom);
    REQUIRE(clock.getSimTime() == custom);
}

TEST_CASE("SimClock: setTicksPerDay", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 72000);

    clock.setTicksPerDay(200);
    REQUIRE(clock.getTicksPerDay() == 200);
}

TEST_CASE("SimClock: parseDate parses YYYY-MM-DD", "[simclock]") {
    Timestamp t = SimClock::parseDate("2025-01-01");
    REQUIRE(t > 0);

    Timestamp t2 = SimClock::parseDate("2024-06-15");
    REQUIRE(t2 > 0);
    REQUIRE(t2 < t); // June 2024 < Jan 2025
}

TEST_CASE("SimClock: parseDate throws on invalid format", "[simclock]") {
    REQUIRE_THROWS_AS(SimClock::parseDate("invalid-date"), std::runtime_error);
    REQUIRE_THROWS_AS(SimClock::parseDate(""), std::runtime_error);
}

TEST_CASE("SimClock: formatDate round-trips", "[simclock]") {
    Timestamp t = SimClock::parseDate("2025-06-15");
    std::string formatted = SimClock::formatDate(t);
    REQUIRE(formatted == "2025-06-15");
}

TEST_CASE("SimClock: formatDateTime returns ISO format", "[simclock]") {
    Timestamp t = SimClock::parseDate("2025-01-01");
    std::string dt = SimClock::formatDateTime(t);
    // Should contain T and Z for ISO 8601
    REQUIRE(dt.find('T') != std::string::npos);
    REQUIRE(dt.find('Z') != std::string::npos);
    REQUIRE(dt.substr(0, 10) == "2025-01-01");
}

TEST_CASE("SimClock: convenience methods", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-03-15", 72000);

    REQUIRE(clock.currentTimestamp() == clock.getSimTime());
    REQUIRE(clock.currentDateString() == "2025-03-15");

    std::string dt = clock.currentDateTimeString();
    REQUIRE(dt.substr(0, 10) == "2025-03-15");
}

TEST_CASE("SimClock: full day simulation", "[simclock]") {
    SimClock clock;
    clock.initialize("2025-01-01", 100); // 100 ticks per day

    Timestamp startOfDay = clock.getSimTime();

    for (int i = 0; i < 100; i++) {
        clock.tick();
    }

    // After one full day of ticks, time should advance by ~86400000ms
    Timestamp elapsed = clock.getSimTime() - startOfDay;
    // Allow some floating-point rounding
    REQUIRE(elapsed >= 86399000);
    REQUIRE(elapsed <= 86401000);
}
