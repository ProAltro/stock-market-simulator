cmake_minimum_required(VERSION 3.16)
project(MarketSim VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Threads REQUIRED)

include(FetchContent)

FetchContent_Declare(
    spdlog
    GIT_REPOSITORY https://github.com/gabime/spdlog.git
    GIT_TAG v1.12.0
)
FetchContent_MakeAvailable(spdlog)

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.14.3
)
FetchContent_MakeAvailable(httplib)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.5.2
)
FetchContent_MakeAvailable(Catch2)

set(SOURCES
    src/main.cpp
    src/core/Commodity.cpp
    src/core/OrderBook.cpp
    src/core/SimClock.cpp
    src/core/CandleAggregator.cpp
    src/agents/Agent.cpp
    src/agents/SupplyDemandTrader.cpp
    src/agents/MomentumTrader.cpp
    src/agents/MeanReversionTrader.cpp
    src/agents/NoiseTrader.cpp
    src/agents/MarketMaker.cpp
    src/agents/CrossEffectsTrader.cpp
    src/agents/InventoryTrader.cpp
    src/agents/EventTrader.cpp
    src/environment/NewsGenerator.cpp
    src/engine/MarketEngine.cpp
    src/engine/Simulation.cpp
    src/api/ApiServer.cpp
)

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

if(WIN32)
    target_compile_definitions(market_sim PRIVATE
        _WIN32_WINNT=0x0601
        NOMINMAX
    )
endif()

configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/commodities.json
    ${CMAKE_CURRENT_BINARY_DIR}/commodities.json
    COPYONLY
)

option(BUILD_TESTS "Build unit tests" ON)
if(BUILD_TESTS)
    # Core unit tests (fast)
    set(TEST_SOURCES
        tests/test_orderbook.cpp
        tests/test_commodity.cpp
        tests/test_types.cpp
        tests/test_news.cpp
        src/core/OrderBook.cpp
        src/core/Commodity.cpp
        src/core/SimClock.cpp
        src/environment/NewsGenerator.cpp
    )

    add_executable(orderbook_tests ${TEST_SOURCES})

    target_include_directories(orderbook_tests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
    )

    target_link_libraries(orderbook_tests PRIVATE
        spdlog::spdlog
        Catch2::Catch2WithMain
        Threads::Threads
    )

    # TickBuffer tests
    set(TICKBUFFER_TEST_SOURCES
        tests/test_tickbuffer.cpp
        src/core/Commodity.cpp
        src/core/OrderBook.cpp
        src/core/SimClock.cpp
    )

    add_executable(tickbuffer_tests ${TICKBUFFER_TEST_SOURCES})

    target_include_directories(tickbuffer_tests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
    )

    target_link_libraries(tickbuffer_tests PRIVATE
        spdlog::spdlog
        Catch2::Catch2WithMain
        Threads::Threads
    )

    # Market naturalness tests (requires full simulation)
    set(MARKET_TEST_SOURCES
        tests/test_market_natural.cpp
        src/core/OrderBook.cpp
        src/core/Commodity.cpp
        src/core/SimClock.cpp
        src/core/CandleAggregator.cpp
        src/agents/Agent.cpp
        src/agents/SupplyDemandTrader.cpp
        src/agents/MomentumTrader.cpp
        src/agents/MeanReversionTrader.cpp
        src/agents/NoiseTrader.cpp
        src/agents/MarketMaker.cpp
        src/agents/CrossEffectsTrader.cpp
        src/agents/InventoryTrader.cpp
        src/agents/EventTrader.cpp
        src/environment/NewsGenerator.cpp
        src/engine/MarketEngine.cpp
        src/engine/Simulation.cpp
    )

    add_executable(market_tests ${MARKET_TEST_SOURCES})

    target_include_directories(market_tests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
    )

    target_link_libraries(market_tests PRIVATE
        spdlog::spdlog
        nlohmann_json::nlohmann_json
        Catch2::Catch2WithMain
        Threads::Threads
    )

    # SimClock + CandleAggregator tests
    set(CANDLE_SIMCLOCK_TEST_SOURCES
        tests/test_candle_simclock.cpp
        tests/test_simclock.cpp
        src/core/SimClock.cpp
        src/core/CandleAggregator.cpp
        src/core/Commodity.cpp
        src/core/OrderBook.cpp
    )

    add_executable(candle_simclock_tests ${CANDLE_SIMCLOCK_TEST_SOURCES})

    target_include_directories(candle_simclock_tests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
    )

    target_link_libraries(candle_simclock_tests PRIVATE
        spdlog::spdlog
        Catch2::Catch2WithMain
        Threads::Threads
    )

    if(WIN32)
        target_compile_definitions(orderbook_tests PRIVATE
            _WIN32_WINNT=0x0601
            NOMINMAX
        )
        target_compile_definitions(tickbuffer_tests PRIVATE
            _WIN32_WINNT=0x0601
            NOMINMAX
        )
        target_compile_definitions(market_tests PRIVATE
            _WIN32_WINNT=0x0601
            NOMINMAX
        )
        target_compile_definitions(candle_simclock_tests PRIVATE
            _WIN32_WINNT=0x0601
            NOMINMAX
        )
    endif()

    enable_testing()
    include(CTest)
    include(Catch)
    catch_discover_tests(orderbook_tests)
    catch_discover_tests(tickbuffer_tests)
    catch_discover_tests(market_tests)
    catch_discover_tests(candle_simclock_tests)
endif()
