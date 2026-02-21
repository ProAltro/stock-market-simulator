#pragma once

#include "Types.hpp"
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <cstdint>
#include <filesystem>

namespace market {

    struct TickData {
        uint64_t tick;
        Price open;
        Price high;
        Price low;
        Price close;
        double volume;
    };

    struct NewsData {
        std::string symbol;
        std::string category;
        std::string sentiment;
        double magnitude;
        std::string headline;
    };

    class TickBuffer {
    public:
        TickBuffer(size_t maxTicks = 1000000) 
            : maxTicks_(maxTicks), currentTick_(0), exporting_(false), exportProgress_(0.0) {}

        void addSymbol(const std::string& symbol) {
            std::lock_guard<std::mutex> lock(mutex_);
            ticks_[symbol] = std::vector<TickData>();
            ticks_[symbol].reserve(maxTicks_);
        }

        void recordTick(const std::string& symbol, Price open, Price high, Price low, Price close, double volume) {
            std::lock_guard<std::mutex> lock(mutex_);
            
            auto it = ticks_.find(symbol);
            if (it == ticks_.end()) return;

            TickData td;
            td.tick = currentTick_;
            td.open = open;
            td.high = high;
            td.low = low;
            td.close = close;
            td.volume = volume;

            it->second.push_back(td);
        }

        void recordNews(uint64_t tick, const NewsData& news) {
            std::lock_guard<std::mutex> lock(mutex_);
            news_[tick].push_back(news);
        }

        void advanceTick() {
            std::lock_guard<std::mutex> lock(mutex_);
            currentTick_++;
        }

        void setCurrentTick(uint64_t tick) {
            std::lock_guard<std::mutex> lock(mutex_);
            currentTick_ = tick;
        }

        size_t getTickCount() const {
            std::lock_guard<std::mutex> lock(mutex_);
            if (ticks_.empty()) return 0;
            return ticks_.begin()->second.size();
        }

        uint64_t getCurrentTick() const {
            std::lock_guard<std::mutex> lock(mutex_);
            return currentTick_;
        }

        bool exportToJson(const std::string& filepath, size_t maxTicks = 0) {
            std::lock_guard<std::mutex> lock(mutex_);
            
            if (ticks_.empty()) return false;

            exporting_ = true;
            exportProgress_ = 0.0;

            size_t limit = (maxTicks > 0) ? std::min(maxTicks, currentTick_) : currentTick_;

            std::ofstream file(filepath);
            if (!file.is_open()) {
                exporting_ = false;
                return false;
            }

            file << "{\n";
            
            size_t symbolCount = 0;
            for (const auto& [symbol, tickData] : ticks_) {
                if (symbolCount > 0) file << ",\n";
                
                file << "  \"" << symbol << "\": {\n";
                file << "    \"ticks\": [\n";

                size_t count = 0;
                size_t exportCount = std::min(limit, tickData.size());
                for (size_t i = 0; i < exportCount; ++i) {
                    const auto& td = tickData[i];
                    file << "      {\"tick\":" << td.tick 
                         << ",\"open\":" << td.open 
                         << ",\"high\":" << td.high 
                         << ",\"low\":" << td.low 
                         << ",\"close\":" << td.close 
                         << ",\"volume\":" << td.volume << "}";
                    
                    if (i < exportCount - 1) file << ",";
                    file << "\n";
                    
                    if (i % 10000 == 0) {
                        exportProgress_ = static_cast<double>(i) / exportCount * 0.5;
                    }
                }

                file << "    ],\n";
                file << "    \"orderbooks\": {}\n";
                file << "  }";
                
                symbolCount++;
                exportProgress_ = static_cast<double>(symbolCount) / ticks_.size() * 0.5;
            }

            file << ",\n  \"_news\": {\n";
            
            size_t newsCount = 0;
            size_t newsTotal = news_.size();
            for (const auto& [tick, events] : news_) {
                if (tick >= limit) break;
                
                if (newsCount > 0) file << ",\n";
                file << "    \"" << tick << "\": [\n";
                
                for (size_t i = 0; i < events.size(); ++i) {
                    const auto& ne = events[i];
                    file << "      {\"symbol\":\"" << ne.symbol 
                         << "\",\"category\":\"" << ne.category 
                         << "\",\"sentiment\":\"" << ne.sentiment 
                         << "\",\"magnitude\":" << ne.magnitude 
                         << ",\"headline\":\"" << escapeJson(ne.headline) << "\"}";
                    
                    if (i < events.size() - 1) file << ",";
                    file << "\n";
                }
                
                file << "    ]";
                newsCount++;
            }
            
            file << "\n  }\n";
            file << "}\n";

            file.close();
            exporting_ = false;
            exportProgress_ = 1.0;

            return true;
        }

        bool exportToCsv(const std::string& dir, size_t maxTicks = 0) {
            std::lock_guard<std::mutex> lock(mutex_);
            
            if (ticks_.empty()) return false;

            exporting_ = true;
            exportProgress_ = 0.0;

            std::filesystem::create_directories(dir);

            size_t limit = (maxTicks > 0) ? std::min(maxTicks, currentTick_) : currentTick_;

            size_t symbolCount = 0;
            for (const auto& [symbol, tickData] : ticks_) {
                std::string filepath = dir + "/" + symbol + ".csv";
                std::ofstream file(filepath);
                
                if (!file.is_open()) {
                    exporting_ = false;
                    return false;
                }

                file << "tick,open,high,low,close,volume\n";

                size_t exportCount = std::min(limit, tickData.size());
                for (size_t i = 0; i < exportCount; ++i) {
                    const auto& td = tickData[i];
                    file << td.tick << "," 
                         << std::fixed << std::setprecision(4) << td.open << ","
                         << std::fixed << std::setprecision(4) << td.high << ","
                         << std::fixed << std::setprecision(4) << td.low << ","
                         << std::fixed << std::setprecision(4) << td.close << ","
                         << std::fixed << std::setprecision(2) << td.volume << "\n";
                }

                file.close();
                symbolCount++;
                exportProgress_ = static_cast<double>(symbolCount) / ticks_.size();
            }

            std::ofstream metaFile(dir + "/metadata.json");
            metaFile << "{\"totalTicks\":" << currentTick_ 
                     << ",\"exportedTicks\":" << limit 
                     << ",\"commodities\":" << ticks_.size() 
                     << ",\"exportedAt\":\"" << getCurrentTimestamp() << "\"}\n";
            metaFile.close();

            exporting_ = false;
            exportProgress_ = 1.0;

            return true;
        }

        std::map<std::string, std::vector<TickData>> getTicks(size_t startTick, size_t count) const {
            std::lock_guard<std::mutex> lock(mutex_);
            
            std::map<std::string, std::vector<TickData>> result;
            
            for (const auto& [symbol, tickData] : ticks_) {
                result[symbol] = std::vector<TickData>();
                
                size_t endTick = std::min(startTick + count, tickData.size());
                for (size_t i = startTick; i < endTick; ++i) {
                    result[symbol].push_back(tickData[i]);
                }
            }
            
            return result;
        }

        bool isExporting() const {
            std::lock_guard<std::mutex> lock(mutex_);
            return exporting_;
        }

        double getExportProgress() const {
            std::lock_guard<std::mutex> lock(mutex_);
            return exportProgress_;
        }

        void clear() {
            std::lock_guard<std::mutex> lock(mutex_);
            ticks_.clear();
            news_.clear();
            currentTick_ = 0;
        }

    private:
        size_t maxTicks_;
        uint64_t currentTick_;
        std::map<std::string, std::vector<TickData>> ticks_;
        std::map<uint64_t, std::vector<NewsData>> news_;
        mutable std::mutex mutex_;
        bool exporting_;
        double exportProgress_;

        std::string escapeJson(const std::string& s) const {
            std::string result;
            for (char c : s) {
                switch (c) {
                    case '"': result += "\\\""; break;
                    case '\\': result += "\\\\"; break;
                    case '\n': result += "\\n"; break;
                    case '\r': result += "\\r"; break;
                    case '\t': result += "\\t"; break;
                    default: result += c;
                }
            }
            return result;
        }

        std::string getCurrentTimestamp() const {
            auto now = std::chrono::system_clock::now();
            auto time = std::chrono::system_clock::to_time_t(now);
            std::stringstream ss;
            ss << std::put_time(std::localtime(&time), "%Y-%m-%dT%H:%M:%SZ");
            return ss.str();
        }
    };

} // namespace market
