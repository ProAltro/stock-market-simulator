#pragma once

#include "Types.hpp"
#include "SimClock.hpp"
#include <vector>
#include <deque>
#include <map>
#include <string>

namespace market {

    // Aggregates tick-level price data into OHLCV candles at multiple intervals
    class CandleAggregator {
    public:
        // Supported intervals in simulated milliseconds
        enum class Interval {
            M1,     // 1 minute
            M5,     // 5 minutes
            M15,    // 15 minutes
            H1,     // 1 hour
            D1      // 1 day
        };

        CandleAggregator();

        // Initialize with the clock reference for time boundaries
        void initialize(const SimClock* clock);

        // Register a symbol to track
        void addSymbol(const std::string& symbol);

        // Feed a new price tick
        void onTick(const std::string& symbol, Price price, double volume, Timestamp simTime);

        // Get completed candles for a symbol at a given interval
        std::vector<Candle> getCandles(const std::string& symbol, Interval interval,
            Timestamp since = 0, int limit = 500) const;

        // Get candles for ALL symbols at a given interval (bulk fetch)
        std::map<std::string, std::vector<Candle>> getAllCandles(Interval interval,
            Timestamp since = 0) const;

        // Get the current (incomplete) candle for a symbol
        Candle getCurrentCandle(const std::string& symbol, Interval interval) const;

        // Get total candle count for a symbol/interval
        size_t getCandleCount(const std::string& symbol, Interval interval) const;

        // Clear all data
        void reset();

        // Convert interval enum to string
        static std::string intervalToString(Interval interval);

        // Parse interval string to enum
        static Interval parseInterval(const std::string& str);

        // Get interval duration in simulated milliseconds
        static Timestamp getIntervalMs(Interval interval);

    private:
        static constexpr size_t MAX_CANDLES = 10000;

        static constexpr Timestamp MS_PER_MINUTE = 60000;
        static constexpr Timestamp MS_PER_HOUR = 3600000;
        static constexpr Timestamp MS_PER_DAY = 86400000;

        struct CandleState {
            Candle current;          // Currently building candle
            std::deque<Candle> completed;  // Completed candles
            bool hasData = false;
        };

        // symbol -> interval -> candle state
        std::map<std::string, std::map<Interval, CandleState>> data_;

        const SimClock* clock_ = nullptr;

        // Get the candle boundary start time for a given timestamp and interval
        Timestamp getCandleBoundary(Timestamp time, Interval interval) const;

        // Close current candle and start a new one
        void closeCandle(CandleState& state, Timestamp newBoundary);
    };

} // namespace market
