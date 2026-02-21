#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/TickBuffer.hpp"
#include <filesystem>
#include <fstream>

using namespace market;
namespace fs = std::filesystem;

class TickBufferTestFixture {
public:
    TickBufferTestFixture() : buffer_(10000) {
        testDir_ = std::filesystem::temp_directory_path() / "tickbuffer_test";
        std::filesystem::create_directories(testDir_);
    }
    
    ~TickBufferTestFixture() {
        std::filesystem::remove_all(testDir_);
    }
    
    std::filesystem::path testDir_;
    TickBuffer buffer_;
};

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Initial state", "[tickbuffer]") {
    TickBuffer freshBuffer(1000);
    
    REQUIRE(freshBuffer.getTickCount() == 0);
    REQUIRE(freshBuffer.getCurrentTick() == 0);
    REQUIRE_FALSE(freshBuffer.isExporting());
    REQUIRE(freshBuffer.getExportProgress() == Catch::Approx(0.0));
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Add symbols", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    buffer_.addSymbol("STEEL");
    
    REQUIRE(buffer_.getTickCount() == 0);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Record ticks", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    
    buffer_.recordTick("OIL", 75.0, 76.0, 74.0, 75.5, 1000);
    buffer_.advanceTick();
    
    REQUIRE(buffer_.getTickCount() == 1);
    REQUIRE(buffer_.getCurrentTick() == 1);
    
    buffer_.recordTick("OIL", 75.5, 77.0, 75.0, 76.5, 1200);
    buffer_.advanceTick();
    
    REQUIRE(buffer_.getTickCount() == 2);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Multiple commodities", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    buffer_.addSymbol("STEEL");
    buffer_.addSymbol("WOOD");
    
    for (int i = 0; i < 100; ++i) {
        buffer_.recordTick("OIL", 75.0 + i * 0.1, 76.0 + i * 0.1, 74.0 + i * 0.1, 75.5 + i * 0.1, 1000 + i);
        buffer_.recordTick("STEEL", 120.0 + i * 0.2, 121.0 + i * 0.2, 119.0 + i * 0.2, 120.5 + i * 0.2, 500 + i);
        buffer_.recordTick("WOOD", 45.0 + i * 0.05, 46.0 + i * 0.05, 44.0 + i * 0.05, 45.5 + i * 0.05, 800 + i);
        buffer_.advanceTick();
    }
    
    REQUIRE(buffer_.getTickCount() == 100);
    REQUIRE(buffer_.getCurrentTick() == 100);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Record news", "[tickbuffer]") {
    NewsData news;
    news.symbol = "OIL";
    news.category = "supply";
    news.sentiment = "positive";
    news.magnitude = 0.05;
    news.headline = "Test news event";
    
    buffer_.recordNews(50, news);
    
    // News should not affect tick count
    REQUIRE(buffer_.getTickCount() == 0);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Export to JSON", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    
    for (int i = 0; i < 10; ++i) {
        buffer_.recordTick("OIL", 75.0 + i, 76.0 + i, 74.0 + i, 75.5 + i, 1000.0 + i);
        buffer_.advanceTick();
    }
    
    std::string jsonPath = (testDir_ / "test_export.json").string();
    bool success = buffer_.exportToJson(jsonPath, 0);
    
    REQUIRE(success);
    REQUIRE(std::filesystem::exists(jsonPath));
    
    // Check file has content
    std::ifstream file(jsonPath);
    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    
    REQUIRE(content.find("\"OIL\"") != std::string::npos);
    REQUIRE(content.find("\"ticks\"") != std::string::npos);
    REQUIRE(content.find("\"open\"") != std::string::npos);
    REQUIRE(content.find("\"close\"") != std::string::npos);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Export JSON with limit", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    
    for (int i = 0; i < 100; ++i) {
        buffer_.recordTick("OIL", 75.0 + i, 76.0 + i, 74.0 + i, 75.5 + i, 1000.0 + i);
        buffer_.advanceTick();
    }
    
    std::string jsonPath = (testDir_ / "test_export_limited.json").string();
    bool success = buffer_.exportToJson(jsonPath, 50);
    
    REQUIRE(success);
    
    // File should contain limited ticks
    std::ifstream file(jsonPath);
    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    
    // Should not contain tick 99
    REQUIRE(content.find("\"tick\":99") == std::string::npos);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Export to CSV", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    buffer_.addSymbol("STEEL");
    
    for (int i = 0; i < 10; ++i) {
        buffer_.recordTick("OIL", 75.0 + i, 76.0 + i, 74.0 + i, 75.5 + i, 1000.0 + i);
        buffer_.recordTick("STEEL", 120.0 + i, 121.0 + i, 119.0 + i, 120.5 + i, 500.0 + i);
        buffer_.advanceTick();
    }
    
    std::string csvDir = (testDir_ / "csv").string();
    bool success = buffer_.exportToCsv(csvDir, 0);
    
    REQUIRE(success);
    REQUIRE(std::filesystem::exists(testDir_ / "csv" / "OIL.csv"));
    REQUIRE(std::filesystem::exists(testDir_ / "csv" / "STEEL.csv"));
    REQUIRE(std::filesystem::exists(testDir_ / "csv" / "metadata.json"));
    
    // Check CSV content
    std::ifstream oilFile(testDir_ / "csv" / "OIL.csv");
    std::string line;
    std::getline(oilFile, line); // Header
    
    REQUIRE(line == "tick,open,high,low,close,volume");
    
    std::getline(oilFile, line); // First data row
    REQUIRE(line.find("0,") == 0);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Clear buffer", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    
    for (int i = 0; i < 10; ++i) {
        buffer_.recordTick("OIL", 75.0, 76.0, 74.0, 75.5, 1000.0);
        buffer_.advanceTick();
    }
    
    REQUIRE(buffer_.getTickCount() == 10);
    
    buffer_.clear();
    
    REQUIRE(buffer_.getTickCount() == 0);
    REQUIRE(buffer_.getCurrentTick() == 0);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Set current tick", "[tickbuffer]") {
    buffer_.setCurrentTick(500);
    
    REQUIRE(buffer_.getCurrentTick() == 500);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Get ticks range", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    
    for (int i = 0; i < 100; ++i) {
        buffer_.recordTick("OIL", 75.0 + i, 76.0 + i, 74.0 + i, 75.5 + i, 1000.0 + i);
        buffer_.advanceTick();
    }
    
    auto ticks = buffer_.getTicks(50, 10);
    
    REQUIRE(ticks.size() == 1); // Only OIL
    REQUIRE(ticks["OIL"].size() == 10);
    
    // Check first tick is tick 50
    REQUIRE(ticks["OIL"][0].tick == 50);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Export progress", "[tickbuffer]") {
    // Initially not exporting
    REQUIRE_FALSE(buffer_.isExporting());
    REQUIRE(buffer_.getExportProgress() == Catch::Approx(0.0));
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Empty buffer export", "[tickbuffer]") {
    std::string jsonPath = (testDir_ / "empty_export.json").string();
    
    // Should return false for empty buffer
    bool success = buffer_.exportToJson(jsonPath, 0);
    REQUIRE_FALSE(success);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Multiple symbols export consistency", "[tickbuffer]") {
    buffer_.addSymbol("OIL");
    buffer_.addSymbol("STEEL");
    buffer_.addSymbol("WOOD");
    
    for (int i = 0; i < 50; ++i) {
        buffer_.recordTick("OIL", 75.0, 76.0, 74.0, 75.5, 1000.0);
        buffer_.recordTick("STEEL", 120.0, 121.0, 119.0, 120.5, 500.0);
        buffer_.recordTick("WOOD", 45.0, 46.0, 44.0, 45.5, 800.0);
        buffer_.advanceTick();
    }
    
    std::string jsonPath = (testDir_ / "multi_export.json").string();
    bool success = buffer_.exportToJson(jsonPath, 0);
    
    REQUIRE(success);
    
    // Verify file contains all symbols
    std::ifstream file(jsonPath);
    std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    
    REQUIRE(content.find("\"OIL\"") != std::string::npos);
    REQUIRE(content.find("\"STEEL\"") != std::string::npos);
    REQUIRE(content.find("\"WOOD\"") != std::string::npos);
}

TEST_CASE_METHOD(TickBufferTestFixture, "TickBuffer: Large tick count", "[tickbuffer]") {
    TickBuffer largeBuffer(100000);
    
    largeBuffer.addSymbol("OIL");
    
    // Simulate many ticks (not actually 1M, but enough to test)
    for (int i = 0; i < 1000; ++i) {
        largeBuffer.recordTick("OIL", 75.0 + (i % 100) * 0.1, 76.0, 74.0, 75.5, 1000.0);
        largeBuffer.advanceTick();
    }
    
    REQUIRE(largeBuffer.getTickCount() == 1000);
}
