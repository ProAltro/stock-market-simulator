# Decrypt — Paper Trading Platform

A full-stack paper trading platform with a high-fidelity commodity market simulator, a real-time trading interface, a code-based backtesting environment (powered by Judge0), and a live leaderboard.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Run with Docker (recommended)](#1-run-with-docker-recommended)
  - [2. Run locally (development)](#2-run-locally-development)
- [Environment Variables](#environment-variables)
- [Components](#components)
  - [Market Simulator (C++)](#market-simulator-c)
  - [Backend (Node.js)](#backend-nodejs)
  - [Frontend](#frontend)
- [Pages](#pages)
- [API Overview](#api-overview)

---

## Overview

Decrypt is a paper trading simulator where users trade simulated commodities (Oil, Steel, Wood, Brick, Grain) against a realistic AI-driven market. Key features include:

- **Realistic market microstructure** — 68 AI agents using 8 strategy types (momentum, mean reversion, market making, etc.) trading on a continuous-double-auction order book
- **Real-time price streaming** — Server-Sent Events (SSE) push live candle and price updates to the UI
- **Backtesting IDE** — Write C++ or other code strategies and run them against historical market data via the Judge0 code execution engine
- **Ranked & Standard modes** — Separate independent portfolios for casual and competitive trading
- **Leaderboard** — Compare ranked performance against other users

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│         Vanilla HTML / CSS / JavaScript             │
│  Dashboard · Market · Compete · Leaderboard · Docs  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / SSE
               ┌───────▼────────┐
               │  Node.js API   │  (Fastify, port 3000)
               │  Auth · Trade  │
               │  News · Market │
               └──┬──────────┬──┘
                  │          │
       ┌──────────▼──┐   ┌───▼──────────────┐
       │  PostgreSQL  │   │  Market Simulator │
       │  (Prisma ORM)│   │  C++, port 8080  │
       └─────────────┘   └──────────────────┘
                  │
       ┌──────────▼──────────┐
       │   Judge0 Engine     │  (port 2358)
       │  Code execution for │
       │  backtest IDE       │
       └─────────────────────┘
```

All services are orchestrated via Docker Compose.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Market Simulator | C++20, CMake, httplib, nlohmann-json |
| Backend | Node.js, Fastify, Prisma ORM, PostgreSQL, Redis |
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript |
| Code Execution | Judge0 v1.13.1 |
| Infrastructure | Docker, Docker Compose, Nginx |
| Auth | JWT (bcrypt password hashing) |
| Market Data | Yahoo Finance (via `yahoo-finance2`) |

---

## Repository Structure

```
decrypt/
├── market_sim/         # C++ commodity market simulator
│   ├── src/
│   │   ├── engine/     # Simulation orchestration & market engine
│   │   ├── core/       # Order book, commodities, clock, candles
│   │   ├── agents/     # 8 AI trader types (68 total agents)
│   │   ├── environment/# News generator (Poisson process)
│   │   └── api/        # HTTP REST API server (port 8080)
│   ├── tests/          # Catch2 unit & market naturalness tests
│   └── CMakeLists.txt
│
├── backend/            # Node.js API server
│   ├── src/
│   │   ├── modules/    # Feature modules
│   │   │   ├── auth/       # Register, login, JWT
│   │   │   ├── market/     # Price data, order routing
│   │   │   ├── data/       # Portfolio, positions, history
│   │   │   ├── news/       # News feed
│   │   │   └── submissions/# Backtest code submissions
│   │   ├── services/   # Shared services (DB, market sim client, etc.)
│   │   └── app.js      # Fastify server entry point
│   ├── prisma/         # Database schema & migrations
│   └── package.json
│
├── frontend/           # Static frontend
│   ├── index.html      # Landing / login page
│   ├── pages/          # App pages (dashboard, market, compete, etc.)
│   ├── assets/         # CSS, JS modules, fonts
│   └── components/     # Shared UI components
│
├── docker/             # Docker & infrastructure config
│   ├── docker-compose.yml
│   ├── Dockerfile.single   # Combined app image (nginx + C++ sim + Node)
│   ├── nginx.conf
│   ├── judge0.conf
│   └── init.sql
│
├── docs/               # MkDocs documentation source
├── mkdocs.yml          # Documentation site config
└── scripts/            # Utility scripts
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended path)
- **Or**, for local development:
  - Node.js 20+
  - PostgreSQL 15+
  - Redis 7+
  - CMake 3.16+ and a C++20 compiler (GCC 10+, Clang 12+, or MSVC)
  - vcpkg (for C++ dependencies: `nlohmann-json`, `httplib`, `catch2`)

---

### 1. Run with Docker (recommended)

```bash
# Clone the repo
git clone <repo-url>
cd decrypt

# Copy and configure the environment file
cp backend/.env.example backend/.env
# Edit backend/.env and set a strong JWT_SECRET

# Build and start all services
cd docker
docker compose up --build
```

Services will be available at:
| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend API | http://localhost:3000 |
| Market Simulator | http://localhost:8080 |
| Judge0 Code Engine | http://localhost:2358 |

> **Note**: On first run, the backend automatically runs Prisma migrations and seeds the database before starting.

---

### 2. Run locally (development)

#### Market Simulator

```bash
cd market_sim

# Configure and build
cmake -B build -S . -DCMAKE_BUILD_TYPE=Debug
cmake --build build --config Debug

# Run the simulator (exposes REST API on :8080)
./build/Debug/market_sim.exe

# Run tests
./build/Debug/market_tests.exe
```

#### Backend

```bash
cd backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your local PostgreSQL and Redis connection strings

# Push schema to database
npm run db:push

# Seed reference data
npm run db:seed

# Start in development mode (auto-restarts on file changes)
npm run dev
```

#### Frontend

The frontend is a collection of static HTML/CSS/JS files. Serve from the `frontend/` directory with any static file server, for example:

```bash
cd frontend
npx serve .
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://decrypt:decrypt123@localhost:5432/decrypt` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing JWTs — **change in production** | — |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `MARKET_SIM_URL` | URL of the C++ simulator | `http://localhost:8080` |
| `MARKET_DATA_PROVIDER` | `yahoo` (live) or `mock` (offline dev) | `yahoo` |
| `DEFAULT_STARTING_BALANCE` | Paper money balance for new accounts | `100000` |

---

## Components

### Market Simulator (C++)

A commodity trading simulation engine (`market_sim/`) that generates realistic market microstructure.

**Commodities traded**: OIL · STEEL · WOOD · BRICK · GRAIN

**68 AI agents across 8 strategy types**:

| Type | Count | Strategy |
|---|---|---|
| SupplyDemandTrader | 15 | Trades on supply/demand imbalance signals |
| MomentumTrader | 10 | Moving average crossover |
| MeanReversionTrader | 10 | Z-score mean reversion |
| NoiseTrader | 8 | Sentiment-driven random trading |
| CrossEffectsTrader | 8 | Cross-commodity correlation arbitrage |
| MarketMaker | 5 | Continuous bid/ask quoting with inventory skew |
| InventoryTrader | 6 | Portfolio rebalancing to target allocations |
| EventTrader | 6 | Reacts to high-magnitude news events |

**Key features**:
- Price-time priority order book with LIMIT and MARKET order types
- Poisson news generator (global, political, supply, demand categories)
- Circuit breaker (±15% max daily move)
- OHLCV candle aggregation (1m, 5m, 15m, 30m, 1h, 1d)
- SSE real-time stream (`/stream`)
- Hot-reloadable runtime config via REST

See [`market_sim/README.md`](market_sim/README.md) for the full API reference and simulation details.

---

### Backend (Node.js)

A Fastify REST API (`backend/`) that acts as the primary interface for the frontend.

**Modules**:
- **`auth`** — User registration, login, JWT issuance
- **`market`** — Proxies price/candle/orderbook data from the C++ simulator; routes user orders
- **`data`** — Portfolio management, position tracking, trade history, P&L
- **`news`** — News event feed
- **`submissions`** — Backtest strategy submissions routed to Judge0

**Database** (PostgreSQL via Prisma):
- Users, accounts (Standard / Ranked modes), positions, orders, trade history

---

### Frontend

A vanilla HTML/CSS/JavaScript single-page-like application (`frontend/`) served by Nginx in Docker.

No framework dependencies — all interactivity is implemented with native browser APIs, `fetch`, and EventSource for SSE.

---

## Pages

| Page | File | Description |
|---|---|---|
| **Landing / Login** | `index.html` | Auth entry point |
| **Dashboard** | `pages/dashboard.html` | Portfolio overview, P&L, holdings |
| **Market** | `pages/market.html` | Live candlestick chart, order book depth, order entry |
| **Compete** | `pages/compete.html` | Backtest IDE — write and run trading strategies |
| **Leaderboard** | `pages/leaderboard.html` | Ranked mode standings |
| **Docs** | `pages/docs.html` | Embedded documentation |

---

## API Overview

The backend exposes a REST API at port **3000**. The C++ simulator exposes its own REST API at port **8080** (typically called only by the backend, not the browser directly).

Key backend endpoints:

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Login, returns JWT |
| `GET` | `/market/commodities` | Live commodity prices |
| `GET` | `/market/candles/:symbol` | OHLCV candle data |
| `GET` | `/market/orderbook/:symbol` | Order book depth |
| `GET` | `/market/stream` | SSE real-time price stream |
| `POST` | `/market/orders` | Place a buy/sell order |
| `GET` | `/data/portfolio` | User portfolio and positions |
| `GET` | `/data/history` | Trade history |
| `POST` | `/submissions` | Submit a backtest strategy |

For the full C++ simulator API reference (simulation control, news injection, config hot-reload, diagnostics), see [`market_sim/README.md`](market_sim/README.md).
