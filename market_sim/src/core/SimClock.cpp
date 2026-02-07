#include "SimClock.hpp"
#include <sstream>
#include <iomanip>
#include <ctime>
#include <stdexcept>

namespace market {

    SimClock::SimClock() {}

    void SimClock::initialize(const std::string& startDate, int ticksPerDay) {
        ticksPerDay_ = ticksPerDay;
        startTimeMs_ = parseDate(startDate);
        simTimeMs_ = startTimeMs_;
        tickInDay_ = 0;
        totalTicks_ = 0;
    }

    Timestamp SimClock::tick() {
        totalTicks_++;
        tickInDay_++;

        if (tickInDay_ >= ticksPerDay_) {
            tickInDay_ = 0;
        }

        // Advance simulated time by one tick's worth of simulated milliseconds
        double msPerTick = getSimMsPerTick();
        simTimeMs_ += static_cast<Timestamp>(msPerTick);

        return simTimeMs_;
    }

    Timestamp SimClock::parseDate(const std::string& dateStr) {
        std::tm tm = {};
        std::istringstream ss(dateStr);
        ss >> std::get_time(&tm, "%Y-%m-%d");
        if (ss.fail()) {
            throw std::runtime_error("Failed to parse date: " + dateStr);
        }
        tm.tm_hour = 9;  // Market open at 9:30 AM
        tm.tm_min = 30;
        tm.tm_sec = 0;

        // Use UTC
#ifdef _WIN32
        time_t t = _mkgmtime(&tm);
#else
        time_t t = timegm(&tm);
#endif

        return static_cast<Timestamp>(t) * 1000;
    }

    std::string SimClock::formatDate(Timestamp ms) {
        time_t t = static_cast<time_t>(ms / 1000);
        std::tm tm;
#ifdef _WIN32
        gmtime_s(&tm, &t);
#else
        gmtime_r(&t, &tm);
#endif

        std::ostringstream ss;
        ss << std::put_time(&tm, "%Y-%m-%d");
        return ss.str();
    }

    std::string SimClock::formatDateTime(Timestamp ms) {
        time_t t = static_cast<time_t>(ms / 1000);
        std::tm tm;
#ifdef _WIN32
        gmtime_s(&tm, &t);
#else
        gmtime_r(&t, &tm);
#endif

        std::ostringstream ss;
        ss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
        return ss.str();
    }

} // namespace market
