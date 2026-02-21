# Market Simulator

A C++ commodity trading simulation engine with realistic market microstructure, multiple agent types, and a REST API for control and data access.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How the Market Works](#how-the-market-works)
- [Commodities](#commodities)
- [Agents](#agents)
- [News System](#news-system)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Building & Running](#building--running)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Simulation                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   MarketEngine                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ Commodities │  │ OrderBooks  │  │   Agents    │  │    │
│  │  │  (OIL, etc) │  │  (matching) │  │ (68 traders)│  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │NewsGenerator│  │  SimClock   │  │CandleAgg    │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                    ┌─────┴─────┐                             │
│                    │ ApiServer │                             │
│                    │  (port    │                             │
│                    │   8080)   │                             │
│                    └───────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

---

## How the Market Works

### Tick Cycle

Each simulation tick (default 50ms) executes the following sequence:

```
1. Advance SimClock          → Update simulated date/time
2. Check New Day             → Reset circuit breakers, daily volumes
3. Generate News             → Poisson process creates events
4. Process News              → Update supply/demand, agent sentiment
5. Decay Sentiment           → Global and commodity sentiment decay
6. Update Supply/Demand      → Production/consumption dynamics
7. Agent Decisions           → Each agent decides whether to trade
8. Order Matching            → Price-time priority matching
9. Price Updates             → Update commodity prices from trades
10. Notify Agents            → Inform agents of fills
11. Aggregate Candles        → Build OHLCV data
```

### Order Book Matching

The order book implements **price-time priority** (FIFO within price level):

- **Bid queue**: Sorted by price (highest first), then timestamp (earliest first)
- **Ask queue**: Sorted by price (lowest first), then timestamp (earliest first)
- Supports **LIMIT** and **MARKET** orders
- Order expiry: Default 2 simulated days (172,800,000 ms)
- Lazy deletion for cancelled orders (marked inactive, skipped during matching)

**Matching Logic**:
```
while (bestBid >= bestAsk):
    1. Skip cancelled/expired orders
    2. Execute at resting order's price
    3. Fill quantity = min(bidQty, askQty)
    4. Create Trade record
    5. Update remaining quantities
```

### Time Scaling

- **Normal mode**: 72,000 ticks/day (1 real hour ≈ 1 simulated day at 50ms/tick)
- **Populate mode**: 576 ticks/day (fast historical data generation)
- **Fine populate**: 1,440 ticks/day (detailed recent history)

The `tickScale` factor normalizes probabilities and decay rates across simulation speeds.

### Circuit Breaker

- Maximum daily price move: 15% (configurable)
- When exceeded, price is clamped and circuit breaker flag is set
- Resets at market open (new day)

---

## Commodities

### Default Commodities

| Symbol | Name      | Category     | Initial Price | Volatility |
|--------|-----------|-------------|---------------|------------|
| OIL    | Crude Oil | Energy      | $75.00        | 3.0%       |
| STEEL  | Steel     | Construction| $120.00       | 2.5%       |
| WOOD   | Lumber    | Construction| $45.00        | 3.5%       |
| BRICK  | Brick     | Construction| $25.00        | 2.0%       |
| GRAIN  | Grain     | Agriculture | $8.00         | 4.0%       |

### Supply/Demand Model

```cpp
struct SupplyDemand {
    double production;    // Current production level
    double imports;       // Import volume
    double exports;       // Export volume
    double consumption;   // Current consumption level
    double inventory;     // Stockpile level

    double getImbalance() const {
        return (demand - supply) / demand;
    }
};
```

**Dynamics**:
- Supply and consumption decay toward base levels each tick
- Random noise added for realism
- Supply/demand shocks applied via news events
- Price pressure: `price *= (1 + imbalance * 0.01 * tickScale)`

### Cross-Effects

Commodities affect each other's prices through correlation:

```json
"crossEffects": {
    "OIL": {"STEEL": 0.25, "BRICK": 0.15, "WOOD": 0.10}
}
```

If OIL price changes by 1%, STEEL is expected to change by 0.25%. `CrossEffectsTrader` agents exploit these correlations.

---

## Agents

The simulation uses **68 agents** across 8 types, each with unique trading strategies.

### Base Agent Class

All agents share:
- **Portfolio management**: Track positions, cash, P&L
- **Sentiment system**: Global and per-commodity sentiment that decays over time
- **News reaction**: `updateBeliefs(news)` adjusts sentiment based on events
- **Risk management**: Cash reserves, position limits, order sizing

**Agent Parameters** (randomly generated per agent):
| Parameter        | Distribution        | Effect                      |
|-----------------|---------------------|----------------------------|
| riskAversion    | 0.1 to ~1.6         | Position sizing            |
| reactionSpeed   | Exponential(λ=1)    | Trading frequency          |
| newsWeight      | Uniform(0.5, 1.5)   | Sensitivity to news        |
| timeHorizon     | Log-normal          | Strategy lookback          |

### Agent Types

#### SupplyDemandTrader (15 agents)
Trades based on supply/demand imbalance.

```
Logic:
  - Estimate imbalance with noise
  - If imbalance > threshold: BUY (demand > supply)
  - If imbalance < -threshold: SELL (supply > demand)
  - Incorporates sentiment bias

Parameters:
  - threshold: 0.02-0.05 (risk-adjusted)
  - noiseStd: 0.01-0.03
```

#### MomentumTrader (10 agents)
Moving average crossover strategy.

```
Logic:
  - Calculate short MA (3-7 ticks) and long MA (13-32 ticks)
  - Signal = (shortMA - longMA) / longMA
  - If signal > threshold: BUY (uptrend)
  - If signal < -threshold: SELL (downtrend)
```

#### MeanReversionTrader (10 agents)
Z-score based mean reversion.

```
Logic:
  - Calculate rolling mean/std (20-40 ticks)
  - zScore = (price - mean) / std
  - If zScore > threshold: SELL (overbought)
  - If zScore < -threshold: BUY (oversold)

Parameters:
  - lookback: 20-40 ticks
  - zThreshold: 1.5-2.5 standard deviations
```

#### NoiseTrader (8 agents)
Random trading with sentiment influence.

```
Logic:
  - Trade probability scales with sentiment intensity
  - Buy/sell bias from sentiment
  - Uses market orders 10% of the time
  - Overreacts to news (amplified sentiment impact)

Parameters:
  - tradeProb: 5-15%
  - sentimentSensitivity: 0.3-0.8
  - Sentiment decays slower than other agents
```

#### MarketMaker (5 agents)
Continuous bid/ask quoting with inventory management.

```
Logic:
  - Quote both sides around mid price
  - Spread = baseSpread * (1 + volatility * mult)
  - Adjust mid price by supply/demand imbalance
  - Inventory skew: Shift quotes to reduce inventory
    - High inventory → Lower quotes (encourage sells)
    - Low inventory → Raise quotes (encourage buys)

Parameters:
  - baseSpread: 0.1-0.3%
  - inventorySkew: 0.05-0.15% per unit
  - maxInventory: 500-1500 units per commodity
```

#### CrossEffectsTrader (8 agents)
Trades based on cross-commodity correlations.

```
Logic:
  - Detect significant price changes in source commodities
  - Calculate expected impact on correlated commodities
  - Trade target commodity in predicted direction

Example: OIL price rises → expect STEEL to rise (coef 0.25)

Parameters:
  - lookbackPeriod: 5-15 ticks
  - changeThreshold: 2-4%
  - crossEffectWeight: 0.3
```

#### InventoryTrader (6 agents)
Portfolio rebalancing to target allocation.

```
Logic:
  - Target inventory value: 10-15% of portfolio
  - Find commodity with largest deviation from target
  - If deviation > threshold: Trade to rebalance

Parameters:
  - targetRatio: 10-15%
  - rebalanceThreshold: 2-4%
```

#### EventTrader (6 agents)
Reacts to high-magnitude news events.

```
Logic:
  - Monitor news for significant events (magnitude > threshold)
  - React immediately with market orders
  - Cooldown period between trades

News interpretation:
  - Positive demand news → BUY
  - Negative supply news (shortage) → BUY
  - Positive supply news (surplus) → SELL
  - Negative demand news → SELL

Parameters:
  - reactionThreshold: 3-5%
  - cooldown: 10-30 ticks
```

---

## News System

### News Categories

| Category   | Scope           | Impact Std | Examples                          |
|------------|-----------------|------------|-----------------------------------|
| GLOBAL     | All commodities | 1.5%       | GDP, inflation, interest rates    |
| POLITICAL  | All commodities | 2.0%       | Tariffs, regulations, sanctions   |
| SUPPLY     | Single commodity| 4.0%       | Production disruptions, discoveries|
| DEMAND     | Single commodity| 4.0%       | Consumption changes, seasonal demand|

### Generation

- **Poisson process** with λ = 0.05 events per tick
- Each event has: category, sentiment (positive/negative/neutral), magnitude, headline
- Magnitude drawn from normal distribution with category-specific std

### Impact

- **Global/Political news**: Updates `globalSentiment` (affects all agents)
- **Supply news**: Modifies commodity production
- **Demand news**: Modifies commodity consumption
- All agents receive news via `updateBeliefs()` and adjust their sentiment

---

## API Reference

The API server runs on port **8080** by default.

### Simulation Control

| Method | Endpoint      | Description                          |
|--------|---------------|--------------------------------------|
| GET    | `/health`     | Health check                         |
| GET    | `/state`      | Current simulation state             |
| POST   | `/control`    | Control: `start`, `pause`, `resume`, `stop`, `reset`, `step` |
| POST   | `/populate`   | Generate historical data (async)     |
| POST   | `/restore`    | Restore from saved state             |

**Control Actions**:
```json
POST /control
{"action": "start"}  // Start simulation
{"action": "pause"}  // Pause simulation
{"action": "resume"} // Resume from pause
{"action": "stop"}   // Stop completely
{"action": "reset"}  // Reset to initial state
{"action": "step", "count": 10}  // Advance N ticks
```

**Populate**:
```json
POST /populate
{
  "days": 180,
  "startDate": "2025-01-01"
}
// Returns immediately; poll /state for progress
```

### Market Data

| Method | Endpoint            | Description                          |
|--------|---------------------|--------------------------------------|
| GET    | `/commodities`      | All commodity prices & supply/demand |
| GET    | `/orderbook/:symbol`| Order book depth (10 levels)         |
| GET    | `/candles/:symbol`  | OHLCV candles                        |
| GET    | `/candles/bulk`     | Candles for all symbols              |
| GET    | `/trades`           | Recent trade log                     |
| GET    | `/metrics`          | Simulation metrics                   |
| GET    | `/agents`           | Agent population summary             |
| GET    | `/diagnostics`      | Comprehensive debug info             |

**Candle Parameters**:
```
GET /candles/OIL?interval=5m&since=1234567890&limit=500

Intervals: 1m, 5m, 15m, 30m, 1h, 1d
```

**Trade Log**:
```
GET /trades?symbol=OIL&limit=100
```

### Orders

| Method | Endpoint  | Description          |
|--------|-----------|----------------------|
| POST   | `/orders` | Submit user order    |

```json
POST /orders
{
  "symbol": "OIL",
  "side": "BUY",
  "type": "LIMIT",
  "price": 76.50,
  "quantity": 100,
  "userId": "user123"
}

Response:
{
  "status": "filled",      // filled, partial, pending
  "orderId": 123456789,
  "symbol": "OIL",
  "side": "BUY",
  "quantity": 100,
  "filledQuantity": 100,
  "avgFillPrice": 76.50,
  "userId": "user123"
}
```

### News

| Method | Endpoint        | Description              |
|--------|-----------------|--------------------------|
| POST   | `/news`         | Inject news event        |
| GET    | `/news/history` | Recent news history      |

```json
POST /news
{
  "category": "supply",
  "sentiment": "negative",
  "magnitude": 0.08,
  "target": "OIL",
  "headline": "Major refinery outage in Gulf"
}

// Categories: global, political, supply, demand
// Sentiment: positive, negative, neutral
// supply/demand require "target" commodity symbol
```

### Configuration

| Method | Endpoint           | Description                    |
|--------|--------------------|--------------------------------|
| GET    | `/config`          | Current runtime config         |
| GET    | `/config/defaults` | Default configuration          |
| POST   | `/config`          | Update config (hot-reloadable) |
| POST   | `/config/reset`    | Reset to defaults              |
| POST   | `/reinitialize`    | Rebuild simulation             |

```json
POST /config
{
  "simulation": {"tickRateMs": 100},
  "news": {"lambda": 0.1},
  "commodity": {"circuitBreakerLimit": 0.10}
}
```

### Real-Time Stream

| Method | Endpoint | Description                        |
|--------|----------|------------------------------------|
| GET    | `/stream`| Server-Sent Events (SSE) real-time |

```
Event stream format:
data: {"type":"update","tick":12345,"simDate":"2025-03-15","commodities":[...]}
data: {"type":"news","events":[...]}
```

---

## Configuration

### Runtime Parameters

Key configuration parameters (see `RuntimeConfig.hpp` for full list):

#### Simulation
| Parameter          | Default  | Description                  |
|-------------------|----------|------------------------------|
| tickRateMs        | 50       | Milliseconds per tick        |
| ticksPerDay       | 72,000   | Ticks per simulated day      |
| startDate         | 2025-01-01| Simulation start date        |

#### Commodities
| Parameter          | Default  | Description                  |
|-------------------|----------|------------------------------|
| circuitBreakerLimit| 0.15    | Max daily price move (15%)   |
| impactDampening   | 0.5      | Trade impact blending        |
| priceFloor        | 0.01     | Minimum price                |
| supplyDecayRate   | 0.1      | Supply decay toward base     |
| demandDecayRate   | 0.1      | Demand decay toward base     |

#### Agent Counts
| Type              | Default  |
|-------------------|----------|
| supplyDemand      | 15       |
| momentum          | 10       |
| meanReversion     | 10       |
| noise             | 8        |
| marketMaker       | 5        |
| crossEffects      | 8        |
| inventory         | 6        |
| event             | 6        |
| **Total**         | **68**   |

#### Agent Cash
| Parameter   | Default   |
|-------------|-----------|
| meanCash    | $100,000  |
| stdCash     | $30,000   |

#### News
| Parameter          | Default | Description              |
|-------------------|---------|--------------------------|
| lambda            | 0.05    | Events per tick          |
| globalImpactStd   | 0.015   | Global news magnitude    |
| politicalImpactStd| 0.02    | Political news magnitude |
| supplyImpactStd   | 0.04    | Supply news magnitude    |
| demandImpactStd   | 0.04    | Demand news magnitude    |

---

## Building & Running

### Prerequisites

- CMake 3.16+
- C++20 compiler (MSVC, GCC 10+, or Clang 12+)
- vcpkg (for dependencies)

### Dependencies

- `nlohmann-json` - JSON parsing
- `httplib` - HTTP server
- `catch2` - Testing framework

### Build

```bash
# Configure
cd market_sim
cmake -B build -S . -DCMAKE_BUILD_TYPE=Debug

# Build
cmake --build build --config Debug

# Build tests only
cmake --build build --target market_tests
```

### Run

```bash
# Run simulation
./build/Debug/market_sim.exe

# Run tests
./build/Debug/market_tests.exe

# Run specific test tag
./build/Debug/market_tests.exe "[market_natural]"
./build/Debug/market_tests.exe "[hft]"
```

### Project Structure

```
market_sim/
├── src/
│   ├── main.cpp              # Entry point
│   ├── api/
│   │   └── ApiServer.cpp     # REST API server
│   ├── engine/
│   │   ├── Simulation.cpp    # Simulation orchestration
│   │   └── MarketEngine.cpp  # Core market logic
│   ├── core/
│   │   ├── Commodity.cpp     # Commodity class
│   │   ├── OrderBook.cpp     # Order matching
│   │   ├── SimClock.cpp      # Time management
│   │   ├── CandleAggregator.cpp
│   │   └── Types.hpp         # Core type definitions
│   ├── agents/
│   │   ├── Agent.cpp         # Base agent class
│   │   ├── SupplyDemandTrader.cpp
│   │   ├── MomentumTrader.cpp
│   │   ├── MeanReversionTrader.cpp
│   │   ├── NoiseTrader.cpp
│   │   ├── MarketMaker.cpp
│   │   ├── CrossEffectsTrader.cpp
│   │   ├── InventoryTrader.cpp
│   │   └── EventTrader.cpp
│   ├── environment/
│   │   └── NewsGenerator.cpp
│   └── utils/
│       ├── Random.hpp        # Singleton RNG
│       └── Logger.hpp
├── tests/
│   ├── test_market_natural.cpp  # HFT/microstructure tests
│   ├── test_orderbook.cpp
│   ├── test_commodity.cpp
│   ├── test_types.cpp
│   └── test_news.cpp
├── CMakeLists.txt
└── README.md
```

---

## Testing

The test suite includes:

### Unit Tests
- `test_orderbook.cpp` - Order book matching logic
- `test_commodity.cpp` - Commodity supply/demand
- `test_types.cpp` - Core type operations
- `test_news.cpp` - News generation

### Market Naturalness Tests (HFT/Microstructure)

Located in `test_market_natural.cpp`, these tests verify the simulation produces realistic market microstructure:

- **Return Distribution**: Leptokurtosis, skewness, Jarque-Bera test
- **Autocorrelation**: ACF of absolute returns, Ljung-Box on squared returns
- **Jump Detection**: BNS test, jump proportion
- **Intraday Patterns**: Volatility/volume patterns
- **Order Book Metrics**: Spread analysis, imbalance autocorrelation
- **Randomness Tests**: Monobit, runs test
- **Cross-Commodity**: Price/volatility correlation

Run with:
```bash
./build/Debug/market_tests.exe "[market_natural]"
```
