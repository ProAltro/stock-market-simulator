# Test Coverage

Overview of what is tested across the Decrypt platform.

## Coverage Map

| Component | Module | Unit Tests | Integration Tests |
|-----------|--------|-----------|-------------------|
| **Backend** | Auth (register/login/JWT) | ✅ 15 tests | ✅ E2E |
| | Market proxy (status/orderbook/candles) | ✅ 12 tests | ✅ Python |
| | News proxy | ✅ 13 tests | — |
| | Submissions (CRUD/leaderboard) | ✅ 18 tests | ✅ E2E |
| | Submission wrappers (Python/C++) | ✅ 14 tests | — |
| | Executor lifecycle | ✅ 15 tests | ✅ E2E |
| | Judge0 client | ✅ 14 tests | ✅ Python |
| | Data routes | ✅ 6 tests | ✅ E2E |
| | App config (CORS/rate-limit/JWT) | ✅ 15 tests | — |
| **Market Sim** | OrderBook | ✅ 65 tests | — |
| | TickBuffer | ✅ 15 tests | — |
| | SimClock | ✅ ~18 tests | — |
| | CandleAggregator | ✅ ~18 tests | — |
| | Full simulation | ✅ 17 tests | ✅ Python |
| **Frontend** | Utils (currency/percent) | ✅ 16 tests | — |
| | API helpers | ✅ 4 tests | — |
| | Template loader | ✅ 4 tests | — |
| | App state | ✅ 3 tests | — |
| **Cross-service** | Docker build | ✅ 16 tests | — |
| | Full submission flow | — | ✅ Python + E2E |
| | Health checks | — | ✅ E2E |

## Total Test Count

| Suite | Tests | Framework |
|-------|-------|-----------|
| Backend unit | 135 | node:test |
| Backend E2E | 13 | node:test |
| C++ unit | 133 | Catch2 |
| Frontend unit | 27 | node:test |
| Python integration | ~20 | pytest |
| Docker build | 16 | bash |
| **Total** | **~344** | |

## What's Not Covered

The following areas rely on manual testing or are covered by integration tests only:

- **Frontend DOM rendering** — Alpine.js components are not unit-tested (requires browser environment)
- **CSS/responsive layout** — Visual testing only
- **WebSocket/SSE streaming** — Event stream from market sim
- **Database migrations** — Prisma schema changes tested via `db push`
- **Production nginx config** — Covered by Docker build tests
