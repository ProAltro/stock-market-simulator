#pragma once

#include <cstdint>
#include <string>
#include <chrono>
#include "Types.hpp"

namespace market {

    // Maps simulation ticks to simulated calendar time
    // 1 real hour = 1 simulated day (at 50ms/tick -> 72000 ticks/day)
    class SimClock {
    public:
        SimClock();

        // Initialize with a start date and ticks-per-day ratio
        void initialize(const std::string& startDate, int ticksPerDay = 72000);

        // Advance by one tick, returns new simulated timestamp
        Timestamp tick();

        // Get current simulated time as epoch milliseconds
        Timestamp getSimTime() const { return simTimeMs_; }

        // Get ticks per day
        int getTicksPerDay() const { return ticksPerDay_; }

        // Get current tick within the day (0 to ticksPerDay-1)
        int getTickInDay() const { return tickInDay_; }

        // Check if a new simulated day just started
        bool isNewDay() const { return tickInDay_ == 0 && totalTicks_ > 0; }

        // Get total ticks elapsed
        uint64_t getTotalTicks() const { return totalTicks_; }

        // Set simulated time directly (for restore)
        void setSimTime(Timestamp ms) { simTimeMs_ = ms; }

        // Set ticks per day (for populate mode)
        void setTicksPerDay(int tpd) { ticksPerDay_ = tpd; }

        // Get milliseconds per tick in simulated time
        double getSimMsPerTick() const {
            // A simulated day is 86400000ms, spread over ticksPerDay ticks
            return 86400000.0 / ticksPerDay_;
        }

        // Get the start date as epoch ms
        Timestamp getStartTime() const { return startTimeMs_; }

        // Parse ISO date string "YYYY-MM-DD" to epoch ms
        static Timestamp parseDate(const std::string& dateStr);

        // Format epoch ms as ISO date string
        static std::string formatDate(Timestamp ms);

        // Format epoch ms as full ISO datetime
        static std::string formatDateTime(Timestamp ms);

        // Convenience: current simulated timestamp
        Timestamp currentTimestamp() const { return simTimeMs_; }

        // Convenience: current date as YYYY-MM-DD string
        std::string currentDateString() const { return formatDate(simTimeMs_); }

        // Convenience: current datetime as ISO string
        std::string currentDateTimeString() const { return formatDateTime(simTimeMs_); }

    private:
        Timestamp startTimeMs_ = 0;
        Timestamp simTimeMs_ = 0;
        int ticksPerDay_ = 72000;
        int tickInDay_ = 0;
        uint64_t totalTicks_ = 0;
    };

} // namespace market
