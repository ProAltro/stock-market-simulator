#pragma once

#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <memory>
#include <string>

namespace market {

class Logger {
public:
    static void init(const std::string& filename = "market_sim.log",
                     const std::string& level = "info",
                     bool console = true) {
        std::vector<spdlog::sink_ptr> sinks;
        
        if (console) {
            auto consoleSink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
            consoleSink->set_level(spdlog::level::trace);
            sinks.push_back(consoleSink);
        }
        
        auto fileSink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(filename, true);
        fileSink->set_level(spdlog::level::trace);
        sinks.push_back(fileSink);
        
        auto logger = std::make_shared<spdlog::logger>("market", sinks.begin(), sinks.end());
        
        // Set level
        if (level == "trace") logger->set_level(spdlog::level::trace);
        else if (level == "debug") logger->set_level(spdlog::level::debug);
        else if (level == "info") logger->set_level(spdlog::level::info);
        else if (level == "warn") logger->set_level(spdlog::level::warn);
        else if (level == "error") logger->set_level(spdlog::level::err);
        else logger->set_level(spdlog::level::info);
        
        logger->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] [%n] %v");
        
        spdlog::set_default_logger(logger);
        spdlog::flush_every(std::chrono::seconds(1));
    }
    
    static std::shared_ptr<spdlog::logger> get() {
        return spdlog::default_logger();
    }
    
    // Convenience methods
    template<typename... Args>
    static void trace(fmt::format_string<Args...> fmt, Args&&... args) {
        spdlog::trace(fmt, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    static void debug(fmt::format_string<Args...> fmt, Args&&... args) {
        spdlog::debug(fmt, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    static void info(fmt::format_string<Args...> fmt, Args&&... args) {
        spdlog::info(fmt, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    static void warn(fmt::format_string<Args...> fmt, Args&&... args) {
        spdlog::warn(fmt, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    static void error(fmt::format_string<Args...> fmt, Args&&... args) {
        spdlog::error(fmt, std::forward<Args>(args)...);
    }
};

} // namespace market
