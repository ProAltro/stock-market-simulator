# Market Simulation Engine

A multi-agent market simulation engine in C++ with a Python dashboard for real-time control and visualization.

## Features

- **Heterogeneous Agents**: 5 agent types with distinct trading strategies
  - Fundamental Traders (value-based)
  - Momentum Traders (MA crossover)
  - Mean Reversion Traders (z-score based)
  - Noise Traders (sentiment-driven random)
  - Market Makers (continuous quoting)

- **Limit Order Book**: Price-time priority matching engine

- **News System**: Stochastic news generation with Poisson arrivals
  - Global, industry, and company-specific news
  - Real-time news injection via dashboard

- **Realistic Dynamics**: Fundamental value evolution, macro environment, sentiment tracking

- **REST API**: Full control and monitoring via HTTP endpoints

- **Python Dashboard**: Real-time visualization and control panel

## Requirements

### C++ Engine
- CMake 3.16+
- C++17 compiler (MSVC, GCC, or Clang)
- Dependencies (fetched automatically):
  - spdlog
  - nlohmann_json
  - cpp-httplib

### Python Dashboard
- Python 3.8+
- See `dashboard/requirements.txt`

## Build Instructions

### Windows (MSVC)

```powershell
cd market_sim
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

### Linux/macOS

```bash
cd market_sim
mkdir build && cd build
cmake ..
make -j$(nproc)
```

## Running

### 1. Start the C++ Simulation Engine

```bash
# From build directory
./market_sim --auto-start

# Or with options
./market_sim --config ../config.json --port 8080 --auto-start
```

### 2. Start the Python Dashboard

```bash
cd dashboard
pip install -r requirements.txt
python app.py
```

Open http://localhost:8050 in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/state` | GET | Current simulation state |
| `/assets` | GET | All asset prices and data |
| `/agents` | GET | Agent population summary |
| `/metrics` | GET | Simulation metrics |
| `/orderbook/:symbol` | GET | Order book for symbol |
| `/control` | POST | Start/pause/stop/reset simulation |
| `/news` | POST | Inject news event |
| `/config` | POST | Update simulation parameters |

## Configuration

Edit `config.json` to customize:

- Simulation speed (tick rate)
- Number of assets
- Agent population distribution
- News generation parameters
- API server settings

## Project Structure

```
market_sim/
├── CMakeLists.txt
├── config.json
├── README.md
├── src/
│   ├── main.cpp
│   ├── core/           # Types, Asset, OrderBook
│   ├── agents/         # Agent strategies
│   ├── environment/    # News, Macro conditions
│   ├── engine/         # MarketEngine, Simulation
│   ├── api/            # REST API server
│   └── utils/          # Logger, Random, Statistics
└── dashboard/
    ├── app.py
    └── requirements.txt
```

## Dashboard Features

- **Control Panel**: Start/pause/stop/reset simulation, adjust tick rate
- **News Injection**: Inject global, industry, or company news with custom impact
- **Parameter Tuning**: Adjust news frequency, global sentiment
- **Price Charts**: Real-time multi-asset price visualization
- **Asset Table**: Current prices, fundamentals, returns, volumes
- **Order Book**: Live bid/ask visualization
- **Agent Summary**: Population distribution by type
- **Metrics**: Total trades, orders, average spread

## License

MIT
