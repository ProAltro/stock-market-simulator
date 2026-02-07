#include "engine/Simulation.hpp"
#include "api/ApiServer.hpp"
#include "utils/Logger.hpp"
#include <iostream>
#include <csignal>

using namespace market;

// Global for signal handling
static Simulation* g_sim = nullptr;
static ApiServer* g_api = nullptr;

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ", shutting down..." << std::endl;

    if (g_sim) {
        g_sim->stop();
    }
    if (g_api) {
        g_api->stop();
    }
}

int main(int argc, char* argv[]) {
    // Setup signal handlers
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    // Parse command line
    std::string configPath = "config.json";
    std::string stocksPath = "stocks.json";
    std::string host = "0.0.0.0";
    int port = 8080;
    bool autoStart = false;
    bool populate = false;
    int populateDays = 180;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) {
            configPath = argv[++i];
        }
        else if (arg == "--stocks" && i + 1 < argc) {
            stocksPath = argv[++i];
        }
        else if (arg == "--host" && i + 1 < argc) {
            host = argv[++i];
        }
        else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        }
        else if (arg == "--auto-start") {
            autoStart = true;
        }
        else if (arg == "--populate") {
            populate = true;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                populateDays = std::stoi(argv[++i]);
            }
        }
        else if (arg == "--help") {
            std::cout << "Market Simulation Engine\n"
                << "Usage: market_sim [options]\n"
                << "Options:\n"
                << "  --config <path>    Path to config file (default: config.json)\n"
                << "  --stocks <path>    Path to stocks JSON file (default: stocks.json)\n"
                << "  --host <host>      API server host (default: 0.0.0.0)\n"
                << "  --port <port>      API server port (default: 8080)\n"
                << "  --auto-start       Start simulation immediately\n"
                << "  --populate [days]  Populate historical data (default: 180 days)\n"
                << "  --help             Show this help\n";
            return 0;
        }
    }

    try {
        // Initialize logger first
        Logger::init("market_sim.log", "info", true);

        Logger::info("=== Market Simulation Engine ===");
        Logger::info("Config: {}", configPath);
        Logger::info("Stocks: {}", stocksPath);
        Logger::info("API: {}:{}", host, port);

        // Create simulation
        Simulation sim;
        g_sim = &sim;

        // Load config and stocks, then initialize
        sim.loadConfig(configPath);
        sim.loadStocks(stocksPath);
        sim.initialize();

        // Create API server
        ApiServer api(sim, host, port);
        g_api = &api;

        // Start API server
        api.start();

        // Populate historical data if requested
        if (populate) {
            Logger::info("Populating {} days of historical data...", populateDays);
            sim.populate(populateDays);
            Logger::info("Population complete");
        }

        // Auto-start simulation if requested
        if (autoStart) {
            sim.start();
        }

        Logger::info("Ready. API available at http://{}:{}", host, port);
        Logger::info("Press Ctrl+C to exit");

        // Wait for API server (blocks until server stops)
        while (api.isRunning()) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }

    }
    catch (const std::exception& e) {
        Logger::error("Fatal error: {}", e.what());
        return 1;
    }

    Logger::info("Shutdown complete");
    return 0;
}
