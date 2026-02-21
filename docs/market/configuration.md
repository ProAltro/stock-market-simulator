# Configuration & Tuning

The market simulation is highly configurable through `commodities.json`. This page documents every parameter and how it affects market behavior.

## Configuration File

The simulation reads its configuration from `commodities.json` in the project root. The file has four main sections:

```json
{
  "commodities": [ ... ],
  "simulation": { ... },
  "agents": { ... },
  "agentCash": { ... },
  "news": { ... }
}
```

## Simulation Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `startDate` | `"2025-01-01"` | Calendar date when the simulation begins |
| `tickRateMs` | `50` | Milliseconds between ticks during live trading |
| `ticksPerDay` | `72,000` | Number of ticks in one simulated trading day (live) |
| `populateTicksPerDay` | `576` | Ticks per day during coarse population phase |
| `populateFineTicksPerDay` | `1,440` | Ticks per day during fine population phase |
| `populateFineDays` | `7` | Number of days to populate at fine resolution |

### Time Mapping

With the default `ticksPerDay` of 72,000 and `tickRateMs` of 50:

- One simulated day takes 72,000 × 0.05s = **60 minutes** of real time
- One simulated hour takes ~5 minutes of real time
- Population of 100 days at 576 ticks/day takes ~30 seconds

## Agent Counts

| Parameter | Default | Description |
|-----------|---------|-------------|
| `supplyDemand` | `15` | Fundamental value traders |
| `momentum` | `10` | Trend followers |
| `meanReversion` | `10` | Counter-trend traders |
| `noise` | `8` | Random liquidity providers |
| `marketMaker` | `5` | Two-sided quoters |
| `crossEffects` | `8` | Inter-commodity correlation traders |
| `inventory` | `6` | Portfolio rebalancers |
| `event` | `6` | News-reactive traders |

**Total: 68 agents** by default. Increasing agent counts adds more liquidity and faster price discovery but increases CPU usage linearly.

## Agent Cash

| Parameter | Default | Description |
|-----------|---------|-------------|
| `meanCash` | `100,000` | Mean starting cash for agents |
| `stdCash` | `30,000` | Standard deviation of starting cash |

Cash is drawn from a normal distribution `N(mean, std)` clamped to a minimum of $10,000.

## News Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `lambda` | `0.05` | Poisson rate — probability of a news event per tick |
| `globalImpactStd` | `0.015` | Standard deviation of global/political news magnitude |
| `politicalImpactStd` | `0.02` | Standard deviation of political news magnitude |
| `supplyImpactStd` | `0.04` | Standard deviation of supply shock magnitude |
| `demandImpactStd` | `0.04` | Standard deviation of demand shock magnitude |

Higher `lambda` generates more frequent news. Higher impact values create more volatile reactions to news.

## Runtime Configuration (API-updatable)

These parameters can be changed on-the-fly via the `PUT /config` API endpoint without restarting:

### Commodity Settings

| Parameter | Default | Effect |
|-----------|---------|--------|
| `impactDampening` | `0.3` | How much order flow impacts price. Lower = more stable prices |
| `priceFloor` | `0.01` | Minimum allowed price for any commodity |
| `circuitBreakerLimit` | `0.10` | Maximum daily price move before trading halts (10%) |
| `supplyDecayRate` | `0.95` | How fast supply shocks fade (0.95 = 5% decay per tick-scale unit) |
| `demandDecayRate` | `0.95` | How fast demand shocks fade |

### Agent Global Settings

| Parameter | Default | Effect |
|-----------|---------|--------|
| `capitalFraction` | `0.05` | Base fraction of capital used per trade |
| `maxOrderSize` | `500` | Maximum units per order |

### Market Maker Settings

| Parameter | Default | Effect |
|-----------|---------|--------|
| `spread` | `0.002` | Percentage spread around mid-price (0.2%) |
| `initialInventoryPerCommodity` | `100` | Starting inventory seeded in each commodity |

### News Impact Settings (Agent Behavior)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `newsImpactMultiplier` | `1.0` | Global multiplier on how strongly agents react to news |
| `sentimentDecayRate` | `0.98` | How fast agent sentiment decays toward zero |

## Commodity Configuration

Each commodity in the `commodities` array accepts:

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol (e.g., "OIL") |
| `name` | string | Human-readable name |
| `category` | string | Market category (Energy, Construction, Agriculture) |
| `initialPrice` | number | Starting price |
| `baseProduction` | number | Fundamental production rate |
| `baseConsumption` | number | Fundamental consumption rate |
| `volatility` | number | Base volatility (0.02 = 2%) |
| `initialInventory` | number | Starting inventory level |
| `crossEffects` | object | Map of symbol → correlation coefficient |

## Building and Running

### Build from Source

```bash
cd market_sim
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --config Release
```

### Run Standalone

```bash
./build/Release/market_sim --populate 100 --auto-start
```

### Command-Line Arguments

| Argument | Description |
|----------|-------------|
| `--populate N` | Populate N days of history before starting live |
| `--auto-start` | Automatically begin live trading after population |
| `--export-on-start` | Export tick data to disk after population |
| `--data-dir PATH` | Directory for exported data files |
| `--port PORT` | REST API port (default: 8080) |

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/state` | Current tick, date, population progress |
| `GET` | `/commodities` | All commodities with current prices |
| `GET` | `/orderbook/:symbol` | Full order book depth |
| `GET` | `/candles/:symbol` | OHLCV data (params: `interval`, `limit`, `since`) |
| `GET` | `/news` | Recent news events (params: `tick`, `limit`) |
| `POST` | `/control` | Start, stop, pause, resume, reset |
| `GET` | `/config` | Current runtime configuration |
| `PUT` | `/config` | Update runtime configuration |
| `GET` | `/stream` | Server-Sent Events stream for real-time data |
