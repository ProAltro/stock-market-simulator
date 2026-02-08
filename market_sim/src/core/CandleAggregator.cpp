#include "CandleAggregator.hpp"
#include <algorithm>
#include <stdexcept>

namespace market {

    CandleAggregator::CandleAggregator() {}

    void CandleAggregator::initialize(const SimClock* clock) {
        clock_ = clock;
    }

    void CandleAggregator::addSymbol(const std::string& symbol) {
        // Initialize candle states for all intervals
        for (auto interval : { Interval::M1, Interval::M5, Interval::M15, Interval::M30, Interval::H1, Interval::D1 }) {
            data_[symbol][interval] = CandleState{};
        }
    }

    void CandleAggregator::onTick(const std::string& symbol, Price price, double volume, Timestamp simTime) {
        auto symbolIt = data_.find(symbol);
        if (symbolIt == data_.end()) return;

        for (auto& [interval, state] : symbolIt->second) {
            Timestamp boundary = getCandleBoundary(simTime, interval);

            if (!state.hasData) {
                // First tick ever for this candle
                state.current.time = boundary;
                state.current.open = price;
                state.current.high = price;
                state.current.low = price;
                state.current.close = price;
                state.current.volume = volume;
                state.hasData = true;
            }
            else if (boundary > state.current.time) {
                // New candle period — close current and start new
                closeCandle(state, boundary);
                state.current.time = boundary;
                state.current.open = price;
                state.current.high = price;
                state.current.low = price;
                state.current.close = price;
                state.current.volume = volume;
            }
            else {
                // Same candle period — update OHLCV
                state.current.high = std::max(state.current.high, price);
                state.current.low = std::min(state.current.low, price);
                state.current.close = price;
                state.current.volume += volume;
            }
        }
    }

    std::vector<Candle> CandleAggregator::getCandles(const std::string& symbol, Interval interval,
        Timestamp since, int limit) const {
        auto symbolIt = data_.find(symbol);
        if (symbolIt == data_.end()) return {};

        auto intervalIt = symbolIt->second.find(interval);
        if (intervalIt == symbolIt->second.end()) return {};

        const auto& completed = intervalIt->second.completed;

        std::vector<Candle> result;
        result.reserve(std::min(static_cast<size_t>(limit), completed.size()));

        for (auto it = completed.rbegin(); it != completed.rend() && static_cast<int>(result.size()) < limit; ++it) {
            if (since > 0 && it->time < since) break;
            result.push_back(*it);
        }

        // Reverse to chronological order
        std::reverse(result.begin(), result.end());

        // Apply since filter
        if (since > 0) {
            result.erase(
                std::remove_if(result.begin(), result.end(),
                    [since](const Candle& c) { return c.time < since; }),
                result.end()
            );
        }

        // Apply limit
        if (static_cast<int>(result.size()) > limit) {
            result.erase(result.begin(), result.end() - limit);
        }

        return result;
    }

    std::map<std::string, std::vector<Candle>> CandleAggregator::getAllCandles(Interval interval,
        Timestamp since) const {
        std::map<std::string, std::vector<Candle>> result;
        for (const auto& [symbol, intervals] : data_) {
            result[symbol] = getCandles(symbol, interval, since, MAX_CANDLES);
        }
        return result;
    }

    Candle CandleAggregator::getCurrentCandle(const std::string& symbol, Interval interval) const {
        auto symbolIt = data_.find(symbol);
        if (symbolIt == data_.end()) return {};

        auto intervalIt = symbolIt->second.find(interval);
        if (intervalIt == symbolIt->second.end()) return {};

        return intervalIt->second.current;
    }

    size_t CandleAggregator::getCandleCount(const std::string& symbol, Interval interval) const {
        auto symbolIt = data_.find(symbol);
        if (symbolIt == data_.end()) return 0;

        auto intervalIt = symbolIt->second.find(interval);
        if (intervalIt == symbolIt->second.end()) return 0;

        return intervalIt->second.completed.size();
    }

    void CandleAggregator::reset() {
        data_.clear();
    }

    std::string CandleAggregator::intervalToString(Interval interval) {
        switch (interval) {
        case Interval::M1:  return "1m";
        case Interval::M5:  return "5m";
        case Interval::M15: return "15m";
        case Interval::M30: return "30m";
        case Interval::H1:  return "1h";
        case Interval::D1:  return "1d";
        }
        return "1d";
    }

    CandleAggregator::Interval CandleAggregator::parseInterval(const std::string& str) {
        if (str == "1m" || str == "M1")  return Interval::M1;
        if (str == "5m" || str == "M5")  return Interval::M5;
        if (str == "15m" || str == "M15") return Interval::M15;
        if (str == "30m" || str == "M30") return Interval::M30;
        if (str == "1h" || str == "H1")  return Interval::H1;
        if (str == "1d" || str == "D1")  return Interval::D1;
        return Interval::D1;
    }

    Timestamp CandleAggregator::getIntervalMs(Interval interval) {
        switch (interval) {
        case Interval::M1:  return MS_PER_MINUTE;
        case Interval::M5:  return 5 * MS_PER_MINUTE;
        case Interval::M15: return 15 * MS_PER_MINUTE;
        case Interval::M30: return 30 * MS_PER_MINUTE;
        case Interval::H1:  return MS_PER_HOUR;
        case Interval::D1:  return MS_PER_DAY;
        }
        return MS_PER_DAY;
    }

    Timestamp CandleAggregator::getCandleBoundary(Timestamp time, Interval interval) const {
        Timestamp intervalMs = getIntervalMs(interval);
        return (time / intervalMs) * intervalMs;
    }

    void CandleAggregator::closeCandle(CandleState& state, Timestamp newBoundary) {
        if (state.hasData && state.current.open > 0) {
            state.completed.push_back(state.current);

            // Bound the deque size
            while (state.completed.size() > MAX_CANDLES) {
                state.completed.pop_front();
            }
        }
    }

} // namespace market
