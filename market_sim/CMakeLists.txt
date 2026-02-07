cmake_minimum_required(VERSION 3.16)
project(MarketSim VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find packages
find_package(Threads REQUIRED)

# Fetch dependencies
include(FetchContent)

# spdlog for logging
FetchContent_Declare(
    spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG v1.12.0
)
FetchContent_MakeAvailable(spdlog)

# nlohmann_json for JSON
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# cpp-httplib for REST API (header-only)
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.14.3
)
FetchContent_MakeAvailable(httplib)

# Source files
set(SOURCES
    src/main.cpp
    src/core/Asset.cpp
    src/core/OrderBook.cpp
    src/core/SimClock.cpp
    src/core/CandleAggregator.cpp
    src/agents/Agent.cpp
    src/agents/FundamentalTrader.cpp
    src/agents/MomentumTrader.cpp
    src/agents/MeanReversionTrader.cpp
    src/agents/NoiseTrader.cpp
    src/agents/MarketMaker.cpp
    src/environment/NewsGenerator.cpp
    src/environment/MacroEnvironment.cpp
    src/engine/MarketEngine.cpp
    src/engine/Simulation.cpp
    src/api/ApiServer.cpp
)

# Main executable
add_executable(market_sim ${SOURCES})

target_include_directories(market_sim PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(market_sim PRIVATE
    spdlog::spdlog
    nlohmann_json::nlohmann_json
    httplib::httplib
    Threads::Threads
)

# Windows-specific settings
if(WIN32)
    target_compile_definitions(market_sim PRIVATE
        _WIN32_WINNT=0x0601
        NOMINMAX
    )
endif()

# Copy config file
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/config.json
    ${CMAKE_CURRENT_BINARY_DIR}/config.json
    COPYONLY
)

# Copy stocks file
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/stocks.json
    ${CMAKE_CURRENT_BINARY_DIR}/stocks.json
    COPYONLY
)
