# Project Structure

```
decrypt/
├── backend/                 # Node.js API server
│   ├── prisma/              # Database schema & seeds
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── app.js           # Fastify application entry
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Authentication (register, login, JWT)
│   │   │   ├── market/      # Market data proxy (status, orderbook, candles)
│   │   │   ├── news/        # News feed proxy
│   │   │   └── submissions/ # Algorithm submissions & leaderboard
│   │   ├── plugins/         # Fastify plugins (prisma, redis)
│   │   ├── routes/          # Additional route handlers (data)
│   │   └── services/        # Core services
│   │       ├── executor/    # Algorithm execution engine
│   │       └── judge0/      # Judge0 sandbox client
│   ├── tests/               # E2E tests
│   ├── sync_sim_data.js     # Utility: sync market_sim data to DB
│   └── tune_sim.js          # Utility: runtime sim tuning CLI
│
├── frontend/                # Static SPA
│   ├── index.html           # Main HTML shell
│   ├── assets/
│   │   ├── styles.css       # Global styles
│   │   └── js/              # JavaScript modules
│   │       ├── api.js       # HTTP client with auth
│   │       ├── utils.js     # Formatting utilities
│   │       ├── main.js      # Alpine.js app composition
│   │       ├── templateLoader.js
│   │       └── modules/     # Feature modules
│   │           ├── auth.js
│   │           ├── marketStatus.js
│   │           ├── router.js
│   │           └── submissions.js
│   ├── components/          # Reusable HTML components
│   ├── pages/               # Page templates
│   └── tests/               # Frontend unit tests
│
├── market_sim/              # C++ market simulation engine
│   ├── CMakeLists.txt
│   ├── commodities.json     # Commodity & simulation config
│   ├── src/
│   │   ├── main.cpp
│   │   ├── engine/          # Simulation, MarketEngine
│   │   ├── core/            # OrderBook, Commodity, SimClock
│   │   ├── agents/          # 8 agent types (Agent base class)
│   │   ├── environment/     # News, CandleAggregator
│   │   ├── api/             # REST API server (cpp-httplib)
│   │   └── utils/           # Logger, Random, RuntimeConfig
│   └── tests/               # Catch2 unit tests
│
├── docker/                  # Docker configuration
│   ├── docker-compose.yml
│   ├── Dockerfile.single    # Multi-stage build
│   ├── entrypoint.sh
│   ├── supervisord.conf
│   └── nginx.conf
│
├── docs/                    # MkDocs source (this documentation)
├── scripts/                 # Test & utility scripts
│   ├── run_all_tests.sh
│   ├── run_all_tests.bat
│   └── test_integration.py
│
└── mkdocs.yml               # Documentation configuration
```

## Key Directories

### `backend/src/modules/`
Each module is self-contained with its own routes, schemas, and tests:

- **auth** — Registration, login, JWT token management, profile CRUD
- **market** — Proxy to C++ market sim (status, orderbook, candles)
- **news** — Proxy to market sim news feed
- **submissions** — Algorithm CRUD, execution trigger, leaderboard

### `backend/src/services/`

- **executor** — Generates language-specific wrappers, injects market data, triggers Judge0, parses results
- **judge0** — Low-level client for the Judge0 code execution API

### `market_sim/src/`
The C++ simulation engine with order book matching, 8 agent types, news generation, and candle aggregation. Exposes a REST API on port 8080.
