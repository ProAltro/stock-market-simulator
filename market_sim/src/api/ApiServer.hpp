#pragma once

#include "engine/Simulation.hpp"
#include <httplib.h>
#include <thread>
#include <atomic>

namespace market {

class ApiServer {
public:
    ApiServer(Simulation& sim, const std::string& host = "0.0.0.0", int port = 8080);
    ~ApiServer();
    
    void start();
    void stop();
    
    bool isRunning() const { return running_.load(); }

private:
    Simulation& sim_;
    httplib::Server server_;
    std::string host_;
    int port_;
    
    std::thread serverThread_;
    std::atomic<bool> running_{false};
    
    void setupRoutes();
    
    // Helper for JSON responses
    static std::string jsonResponse(const nlohmann::json& j);
    static std::string errorResponse(const std::string& message);
};

} // namespace market
