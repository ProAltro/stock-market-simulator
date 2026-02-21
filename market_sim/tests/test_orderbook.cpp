#include <catch2/catch_test_macros.hpp>
#include "core/OrderBook.hpp"
#include "core/SimClock.hpp"
#include <thread>
#include <chrono>

using namespace market;

TEST_CASE("OrderBook: Basic construction", "[orderbook]") {
    OrderBook book("TEST");
    REQUIRE(book.getSymbol() == "TEST");
    REQUIRE(book.getBestBid() == 0.0);
    REQUIRE(book.getBestAsk() > 1e18); // max double
}

TEST_CASE("OrderBook: Add single bid order", "[orderbook]") {
    OrderBook book("TEST");

    Order bid;
    bid.id = 1;
    bid.agentId = 100;
    bid.symbol = "TEST";
    bid.side = OrderSide::BUY;
    bid.type = OrderType::LIMIT;
    bid.price = 100.0;
    bid.quantity = 10;

    book.addOrder(bid);

    REQUIRE(book.getBestBid() == 100.0);
    REQUIRE(book.getBidCount() == 1);
}

TEST_CASE("OrderBook: Add single ask order", "[orderbook]") {
    OrderBook book("TEST");

    Order ask;
    ask.id = 1;
    ask.agentId = 100;
    ask.symbol = "TEST";
    ask.side = OrderSide::SELL;
    ask.type = OrderType::LIMIT;
    ask.price = 105.0;
    ask.quantity = 10;

    book.addOrder(ask);

    REQUIRE(book.getBestAsk() == 105.0);
    REQUIRE(book.getAskCount() == 1);
}

TEST_CASE("OrderBook: Best bid is highest price", "[orderbook]") {
    OrderBook book("TEST");

    Order bid1, bid2, bid3;
    bid1.id = 1; bid1.side = OrderSide::BUY; bid1.type = OrderType::LIMIT;
    bid1.price = 100.0; bid1.quantity = 10; bid1.agentId = 1;

    bid2.id = 2; bid2.side = OrderSide::BUY; bid2.type = OrderType::LIMIT;
    bid2.price = 102.0; bid2.quantity = 10; bid2.agentId = 2;

    bid3.id = 3; bid3.side = OrderSide::BUY; bid3.type = OrderType::LIMIT;
    bid3.price = 101.0; bid3.quantity = 10; bid3.agentId = 3;

    book.addOrder(bid1);
    book.addOrder(bid2);
    book.addOrder(bid3);

    REQUIRE(book.getBestBid() == 102.0);
}

TEST_CASE("OrderBook: Best ask is lowest price", "[orderbook]") {
    OrderBook book("TEST");

    Order ask1, ask2, ask3;
    ask1.id = 1; ask1.side = OrderSide::SELL; ask1.type = OrderType::LIMIT;
    ask1.price = 105.0; ask1.quantity = 10; ask1.agentId = 1;

    ask2.id = 2; ask2.side = OrderSide::SELL; ask2.type = OrderType::LIMIT;
    ask2.price = 103.0; ask2.quantity = 10; ask2.agentId = 2;

    ask3.id = 3; ask3.side = OrderSide::SELL; ask3.type = OrderType::LIMIT;
    ask3.price = 104.0; ask3.quantity = 10; ask3.agentId = 3;

    book.addOrder(ask1);
    book.addOrder(ask2);
    book.addOrder(ask3);

    REQUIRE(book.getBestAsk() == 103.0);
}

TEST_CASE("OrderBook: Cancel order", "[orderbook]") {
    OrderBook book("TEST");

    Order bid;
    bid.id = 1;
    bid.agentId = 100;
    bid.side = OrderSide::BUY;
    bid.type = OrderType::LIMIT;
    bid.price = 100.0;
    bid.quantity = 10;

    book.addOrder(bid);
    REQUIRE(book.getBestBid() == 100.0);

    REQUIRE(book.cancelOrder(1) == true);
    REQUIRE(book.getBestBid() == 0.0);
    REQUIRE(book.cancelOrder(1) == false); // Already cancelled
    REQUIRE(book.cancelOrder(999) == false); // Non-existent
}

TEST_CASE("OrderBook: Match crossing orders", "[orderbook]") {
    OrderBook book("TEST");

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 105.0; bid.quantity = 10;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 100.0; ask.quantity = 10;

    book.addOrder(bid);
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    book.addOrder(ask);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 1);
    REQUIRE(trades[0].price == 105.0); // Bid was resting first
    REQUIRE(trades[0].quantity == 10);
    REQUIRE(trades[0].buyerId == 100);
    REQUIRE(trades[0].sellerId == 200);
}

TEST_CASE("OrderBook: No match when bid < ask", "[orderbook]") {
    OrderBook book("TEST");

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 95.0; bid.quantity = 10;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 100.0; ask.quantity = 10;

    book.addOrder(bid);
    book.addOrder(ask);

    auto trades = book.matchOrders();

    REQUIRE(trades.empty());
    REQUIRE(book.getBestBid() == 95.0);
    REQUIRE(book.getBestAsk() == 100.0);
}

TEST_CASE("OrderBook: Partial fill", "[orderbook]") {
    OrderBook book("TEST");

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 105.0; bid.quantity = 15;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 100.0; ask.quantity = 10;

    book.addOrder(bid);
    book.addOrder(ask);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 1);
    REQUIRE(trades[0].quantity == 10);
    REQUIRE(book.getBestBid() == 105.0); // Remaining bid
    REQUIRE(book.getBidCount() == 1);
}

TEST_CASE("OrderBook: Market order buys at best ask", "[orderbook]") {
    OrderBook book("TEST");

    Order ask;
    ask.id = 1; ask.agentId = 100; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 100.0; ask.quantity = 10;

    Order marketBid;
    marketBid.id = 2; marketBid.agentId = 200; marketBid.side = OrderSide::BUY;
    marketBid.type = OrderType::MARKET;
    marketBid.price = 0.0; marketBid.quantity = 5;

    book.addOrder(ask);
    book.addOrder(marketBid);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 1);
    REQUIRE(trades[0].price == 100.0); // Market buy executes at ask price
    REQUIRE(trades[0].quantity == 5);
}

TEST_CASE("OrderBook: Market order sells at best bid", "[orderbook]") {
    OrderBook book("TEST");

    Order bid;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 100.0; bid.quantity = 10;

    Order marketAsk;
    marketAsk.id = 2; marketAsk.agentId = 200; marketAsk.side = OrderSide::SELL;
    marketAsk.type = OrderType::MARKET;
    marketAsk.price = 0.0; marketAsk.quantity = 5;

    book.addOrder(bid);
    book.addOrder(marketAsk);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 1);
    REQUIRE(trades[0].price == 100.0); // Market sell executes at bid price
    REQUIRE(trades[0].quantity == 5);
}

TEST_CASE("OrderBook: Spread calculation", "[orderbook]") {
    OrderBook book("TEST");

    REQUIRE(book.getSpread() == 0.0); // Empty book

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 99.0; bid.quantity = 10;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 101.0; ask.quantity = 10;

    book.addOrder(bid);
    book.addOrder(ask);

    REQUIRE(book.getSpread() == 2.0);
}

TEST_CASE("OrderBook: Mid price calculation", "[orderbook]") {
    OrderBook book("TEST");

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 99.0; bid.quantity = 10;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 101.0; ask.quantity = 10;

    book.addOrder(bid);
    book.addOrder(ask);

    REQUIRE(book.getMidPrice() == 100.0);
}

TEST_CASE("OrderBook: Clear removes all orders", "[orderbook]") {
    OrderBook book("TEST");

    Order bid, ask;
    bid.id = 1; bid.agentId = 100; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
    bid.price = 100.0; bid.quantity = 10;

    ask.id = 2; ask.agentId = 200; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 105.0; ask.quantity = 10;

    book.addOrder(bid);
    book.addOrder(ask);

    REQUIRE(book.getBestBid() == 100.0);
    REQUIRE(book.getBestAsk() == 105.0);

    book.clear();

    REQUIRE(book.getBestBid() == 0.0);
    REQUIRE(book.getBestAsk() > 1e18);
    REQUIRE(book.getBidCount() == 0);
    REQUIRE(book.getAskCount() == 0);
}

TEST_CASE("OrderBook: Price-time priority", "[orderbook]") {
    OrderBook book("TEST");

    // Two bids at same price, different times (added sequentially)
    Order bid1, bid2;
    bid1.id = 1; bid1.agentId = 100; bid1.side = OrderSide::BUY; bid1.type = OrderType::LIMIT;
    bid1.price = 100.0; bid1.quantity = 10;

    bid2.id = 2; bid2.agentId = 200; bid2.side = OrderSide::BUY; bid2.type = OrderType::LIMIT;
    bid2.price = 100.0; bid2.quantity = 10;

    book.addOrder(bid1);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    book.addOrder(bid2);

    Order ask;
    ask.id = 3; ask.agentId = 300; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
    ask.price = 100.0; ask.quantity = 15;

    book.addOrder(ask);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 2);
    REQUIRE(trades[0].buyerId == 100); // First bid matched first (time priority)
    REQUIRE(trades[0].quantity == 10);
    REQUIRE(trades[1].buyerId == 200); // Second bid matched
    REQUIRE(trades[1].quantity == 5);
}

TEST_CASE("OrderBook: Multiple matches in sequence", "[orderbook]") {
    OrderBook book("TEST");

    // Three asks at different prices
    Order ask1, ask2, ask3;
    ask1.id = 1; ask1.agentId = 100; ask1.side = OrderSide::SELL; ask1.type = OrderType::LIMIT;
    ask1.price = 100.0; ask1.quantity = 5;

    ask2.id = 2; ask2.agentId = 200; ask2.side = OrderSide::SELL; ask2.type = OrderType::LIMIT;
    ask2.price = 101.0; ask2.quantity = 5;

    ask3.id = 3; ask3.agentId = 300; ask3.side = OrderSide::SELL; ask3.type = OrderType::LIMIT;
    ask3.price = 102.0; ask3.quantity = 5;

    book.addOrder(ask1);
    book.addOrder(ask2);
    book.addOrder(ask3);

    // Large market buy should sweep through
    Order marketBuy;
    marketBuy.id = 4; marketBuy.agentId = 400; marketBuy.side = OrderSide::BUY;
    marketBuy.type = OrderType::MARKET;
    marketBuy.price = 0.0; marketBuy.quantity = 12;

    book.addOrder(marketBuy);

    auto trades = book.matchOrders();

    REQUIRE(trades.size() == 3);
    REQUIRE(trades[0].price == 100.0);
    REQUIRE(trades[0].quantity == 5);
    REQUIRE(trades[1].price == 101.0);
    REQUIRE(trades[1].quantity == 5);
    REQUIRE(trades[2].price == 102.0);
    REQUIRE(trades[2].quantity == 2);
}

TEST_CASE("OrderBook: Snapshot aggregates by price", "[orderbook]") {
    OrderBook book("TEST");

    // Multiple orders at same price
    for (int i = 1; i <= 3; i++) {
        Order bid;
        bid.id = i; bid.agentId = i; bid.side = OrderSide::BUY; bid.type = OrderType::LIMIT;
        bid.price = 100.0; bid.quantity = 10;
        book.addOrder(bid);
    }

    for (int i = 4; i <= 6; i++) {
        Order ask;
        ask.id = i; ask.agentId = i; ask.side = OrderSide::SELL; ask.type = OrderType::LIMIT;
        ask.price = 105.0; ask.quantity = 10;
        book.addOrder(ask);
    }

    auto snap = book.getSnapshot(5);

    REQUIRE(snap.bids.size() == 1);
    REQUIRE(snap.bids[0].totalQuantity == 30);
    REQUIRE(snap.asks.size() == 1);
    REQUIRE(snap.asks[0].totalQuantity == 30);
    REQUIRE(snap.bestBid == 100.0);
    REQUIRE(snap.bestAsk == 105.0);
}

TEST_CASE("OrderBook: O(1) best price after cancel", "[orderbook]") {
    OrderBook book("TEST");

    Order bid1, bid2;
    bid1.id = 1; bid1.agentId = 100; bid1.side = OrderSide::BUY; bid1.type = OrderType::LIMIT;
    bid1.price = 100.0; bid1.quantity = 10;

    bid2.id = 2; bid2.agentId = 200; bid2.side = OrderSide::BUY; bid2.type = OrderType::LIMIT;
    bid2.price = 105.0; bid2.quantity = 10;

    book.addOrder(bid1);
    book.addOrder(bid2);

    REQUIRE(book.getBestBid() == 105.0);

    book.cancelOrder(2); // Cancel the best bid

    REQUIRE(book.getBestBid() == 100.0); // Should fall back to second best

    book.cancelOrder(1);

    REQUIRE(book.getBestBid() == 0.0); // No bids left
}

TEST_CASE("OrderBook: Thread safety - concurrent adds", "[orderbook]") {
    OrderBook book("TEST");

    std::vector<std::thread> threads;
    for (int i = 0; i < 10; i++) {
        threads.emplace_back([&book, i]() {
            Order bid;
            bid.id = i + 1;
            bid.agentId = i;
            bid.side = OrderSide::BUY;
            bid.type = OrderType::LIMIT;
            bid.price = 100.0 + i;
            bid.quantity = 10;
            book.addOrder(bid);
        });
    }

    for (auto& t : threads) {
        t.join();
    }

    REQUIRE(book.getBidCount() == 10);
}
