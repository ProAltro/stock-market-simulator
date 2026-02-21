# Running Tests

Decrypt has tests across all components: backend (Node.js), market simulation (C++), frontend, and integration (Python).

## Quick Run

=== "All Tests"

    ```bash
    # From project root
    cd scripts
    ./run_all_tests.sh        # Linux/Mac
    run_all_tests.bat          # Windows
    ```

=== "Backend Only"

    ```bash
    cd backend
    npm test
    ```

=== "Frontend Only"

    ```bash
    node --test frontend/tests/frontend.test.js
    ```

=== "C++ Only"

    ```bash
    cd market_sim/build/Release
    ./tickbuffer_tests
    ./orderbook_tests
    ./market_tests
    ./candle_simclock_tests
    ```

## Integration Tests

Integration tests require running services (Docker containers).

```bash
# Start services first
cd docker && docker-compose up -d

# Run with integration flag
cd backend
INTEGRATION_TEST=true npm test
INTEGRATION_TEST=true node --test tests/e2e.test.js

# Python integration tests
pip install pytest requests
cd scripts
pytest test_integration.py -v
```

## Test Categories

### Backend Unit Tests (`npm test`)

Discovered automatically via `node --test src/**/*.test.js`:

| Module | File | Tests |
|--------|------|-------|
| App | `src/app.test.js` | 15 — routes, CORS, JWT, rate limiting |
| Auth | `src/modules/auth/auth.test.js` | 15 — register, login, JWT, profile |
| Market | `src/modules/market/market.test.js` | 12 — status, orderbook, candles |
| News | `src/modules/news/news.test.js` | 13 — listing, filtering, validation |
| Submissions | `src/modules/submissions/*.test.js` | 32 — CRUD, leaderboard, wrappers |
| Executor | `src/services/executor/executor.cpp.test.js` | 15 — C++ wrapper, execution lifecycle |
| Judge0 | `src/services/judge0/judge0.test.js` | 14 — encoding, status, polling |
| Data | `src/routes/data.test.js` | 6 — info, status, download |

### Backend E2E Tests

```bash
node --test tests/e2e.test.js
```

Tests cross-module flows: data generation, algorithm execution, CSV export, concurrent operations.

### C++ Tests (Catch2)

| Executable | Tests | Description |
|-----------|-------|-------------|
| `tickbuffer_tests` | 15 | Circular tick buffer operations |
| `orderbook_tests` | 65 | Order matching, price-time priority |
| `market_tests` | 17 | Full simulation integration |
| `candle_simclock_tests` | 36 | SimClock + CandleAggregator |

### Frontend Tests

```bash
node --test frontend/tests/frontend.test.js
```

27 tests covering `formatCurrency`, `formatPercent`, API helpers, and template loader logic.

### Python Integration Tests

```bash
pytest scripts/test_integration.py -v
```

Tests Judge0 execution (Python + C++), market sim REST API, backend API, and error handling against live services.

## Environment Variables for Tests

| Variable | Default | Description |
|----------|---------|-------------|
| `INTEGRATION_TEST` | `false` | Set to `true` to run integration tests |
| `BACKEND_URL` | `http://localhost` | Backend URL for E2E tests |
| `MARKET_SIM_URL` | `http://localhost:8080` | Market sim URL |
| `JUDGE0_URL` | `http://localhost:2358` | Judge0 URL |
