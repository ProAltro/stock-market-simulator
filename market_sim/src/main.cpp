#include "engine/Simulation.hpp"
#include "api/ApiServer.hpp"
#include "utils/Logger.hpp"
#include <iostream>
#include <csignal>

using namespace market;

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
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    std::string configPath = "commodities.json";
    std::string host = "0.0.0.0";
    std::string dataDir = "/data";
    int port = 8080;
    bool autoStart = false;
    bool populate = false;
    bool populateByTicks = false;
    bool exportOnStart = false;
    int populateDays = 180;
    uint64_t populateTicksCount = 1000000;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) {
            configPath = argv[++i];
        }
        else if (arg == "--host" && i + 1 < argc) {
            host = argv[++i];
        }
        else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        }
        else if (arg == "--data-dir" && i + 1 < argc) {
            dataDir = argv[++i];
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
        else if (arg == "--populate-ticks") {
            populateByTicks = true;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                populateTicksCount = std::stoull(argv[++i]);
            }
        }
        else if (arg == "--export-on-start") {
            exportOnStart = true;
        }
        else if (arg == "--help") {
            std::cout << "Commodity Market Simulation Engine\n"
                << "Usage: market_sim [options]\n"
                << "Options:\n"
                << "  --config <path>         Path to commodities JSON file (default: commodities.json)\n"
                << "  --host <host>           API server host (default: 0.0.0.0)\n"
                << "  --port <port>           API server port (default: 8080)\n"
                << "  --data-dir <path>       Directory for data files (default: /data)\n"
                << "  --auto-start            Start simulation immediately\n"
                << "  --populate [days]       Populate historical data by days (default: 180 days)\n"
                << "  --populate-ticks [n]    Populate exactly N ticks (default: 1000000)\n"
                << "  --export-on-start       Export data after population\n"
                << "  --help                  Show this help\n";
            return 0;
        }
    }

    try {
        Logger::init("commodity_sim.log", "info", true);

        Logger::info("=== Commodity Market Simulation Engine ===");
        Logger::info("Config: {}", configPath);
        Logger::info("API: {}:{}", host, port);
        Logger::info("Data directory: {}", dataDir);

        Simulation sim;
        g_sim = &sim;

        sim.loadConfig(configPath);
        sim.loadCommodities(configPath);
        sim.initialize();

        ApiServer api(sim, host, port);
        g_api = &api;

        api.start();

        if (populateByTicks) {
            Logger::info("Populating {} ticks...", populateTicksCount);
            sim.populateTicks(populateTicksCount);
            Logger::info("Population complete. {} ticks generated.", sim.getCurrentTick());
        }
        else if (populate) {
            Logger::info("Populating {} days of historical data...", populateDays);
            sim.populate(populateDays);
            Logger::info("Population complete");
        }

        if (exportOnStart && (populate || populateByTicks)) {
            Logger::info("Exporting tick data to {}...", dataDir);
            
            if (sim.getTickBuffer().exportToJson(dataDir + "/full_1m.json", 0)) {
                Logger::info("Exported full dataset to {}/full_1m.json", dataDir);
            }
            if (sim.getTickBuffer().exportToJson(dataDir + "/dev_100k.json", 100000)) {
                Logger::info("Exported dev dataset to {}/dev_100k.json", dataDir);
            }
            if (sim.getTickBuffer().exportToCsv(dataDir + "/csv", 0)) {
                Logger::info("Exported CSV files to {}/csv/", dataDir);
            }
        }

        if (autoStart) {
            sim.start();
        }

        Logger::info("Ready. API available at http://{}:{}", host, port);
        Logger::info("Press Ctrl+C to exit");

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
