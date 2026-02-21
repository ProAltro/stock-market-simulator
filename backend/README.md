# Decrypt Backend

A Fastify-based paper trading platform backend with PostgreSQL, Redis caching, and integration with a C++ market simulation engine.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Market Simulator Integration](#market-simulator-integration)
- [Configuration](#configuration)
- [Development](#development)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Node.js)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     Fastify Server                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │   Auth   │ │  Orders  │ │Portfolio │ │  Market-Sim  │  │  │
│  │  │  Module  │ │  Module  │ │  Module  │ │    Module    │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │Instruments│ │ Backtest │ │Leaderboard│ │   Profile   │  │  │
│  │  │  Module  │ │  Module  │ │  Module  │ │    Module    │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│         ┌──────────────────┼──────────────────┐                  │
│         ▼                  ▼                  ▼                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐        │
│  │  PostgreSQL │   │    Redis    │   │  C++ Market Sim │        │
│  │   (Prisma)  │   │   (Cache)   │   │   (Port 8080)   │        │
│  └─────────────┘   └─────────────┘   └─────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component       | Technology                     |
|-----------------|--------------------------------|
| Runtime         | Node.js 22 (ES Modules)        |
| Framework       | Fastify v4.26                  |
| Database        | PostgreSQL + Prisma ORM        |
| Cache           | Redis (ioredis)                |
| Auth            | JWT (@fastify/jwt)             |
| Market Data     | Yahoo Finance (yahoo-finance2) |
| Code Execution  | Judge0 (for backtests)         |

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint    | Description              | Auth |
|--------|-------------|--------------------------|------|
| POST   | `/register` | Register new user        | No   |
| POST   | `/login`    | User login               | No   |
| GET    | `/me`       | Get current user info    | Yes  |

**Register**:
```json
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "Trader1"
}
```

**Login**:
```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securepassword"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "email": "...", "displayName": "..." }
}
```

### Instruments (`/api/instruments`)

| Method | Endpoint     | Description               | Auth |
|--------|--------------|---------------------------|------|
| GET    | `/search?q=` | Search instruments        | No   |
| GET    | `/`          | List all active instruments| No  |
| GET    | `/:symbol`   | Get instrument by symbol  | No   |

### Market Data (`/api/market`)

| Method | Endpoint            | Description                | Auth |
|--------|---------------------|----------------------------|------|
| GET    | `/quote/:symbol`    | Get real-time quote        | No   |
| GET    | `/history/:symbol`  | Get historical OHLC data   | No   |
| GET    | `/candles/:symbol`  | Get candlestick data       | No   |
| GET    | `/provider`         | Get current data provider  | No   |

**Candles**:
```
GET /api/market/candles/AAPL?interval=1d&range=1mo
```

### Orders (`/api/orders`)

| Method | Endpoint    | Description           | Auth |
|--------|-------------|-----------------------|------|
| POST   | `/`         | Place new order       | Yes  |
| GET    | `/history`  | Get order history     | Yes  |
| DELETE | `/:orderId` | Cancel pending order  | Yes  |

**Place Order**:
```json
POST /api/orders
{
  "symbol": "AAPL",
  "side": "BUY",
  "type": "MARKET",
  "quantity": 100
}

// For limit orders:
{
  "symbol": "AAPL",
  "side": "SELL",
  "type": "LIMIT",
  "quantity": 50,
  "limitPrice": 185.00
}
```

### Portfolio (`/api/portfolio`)

| Method | Endpoint       | Description              | Auth |
|--------|----------------|--------------------------|------|
| GET    | `/`            | Get portfolio summary    | Yes  |
| GET    | `/positions`   | Get all positions        | Yes  |
| GET    | `/history`     | Get trade history        | Yes  |
| GET    | `/analytics`   | Get portfolio analytics  | Yes  |
| GET    | `/performance` | Get performance timeline | Yes  |

### Profile (`/api/profile`)

| Method | Endpoint           | Description                  | Auth |
|--------|--------------------|------------------------------|------|
| GET    | `/`                | Get user profile             | Yes  |
| PATCH  | `/`                | Update profile settings      | Yes  |
| POST   | `/add-funds`       | Add funds (Standard mode)    | Yes  |
| POST   | `/reset-account`   | Reset account to initial     | Yes  |
| POST   | `/switch-mode`     | Switch STANDARD/RANKED       | Yes  |
| GET    | `/:userId`         | Get public profile           | No   |

**Switch Mode**:
```json
POST /api/profile/switch-mode
{
  "mode": "RANKED"  // STANDARD, RANKED, or SIMULATION
}
```

### Leaderboard (`/api/leaderboard`)

| Method | Endpoint | Description             | Auth |
|--------|----------|-------------------------|------|
| GET    | `/`      | Get top traders         | No   |
| GET    | `/me`    | Get current user's rank | Yes  |

### Backtest (`/api/backtest`)

| Method | Endpoint          | Description              | Auth |
|--------|-------------------|--------------------------|------|
| POST   | `/submit`         | Submit backtest code     | Yes  |
| GET    | `/history`        | Get backtest history     | Yes  |
| GET    | `/submission/:id` | Get specific submission  | Yes  |
| GET    | `/templates`      | Get strategy templates   | No   |
| GET    | `/options`        | Get supported options    | No   |
| GET    | `/health`         | Judge0 health check      | No   |

**Submit Backtest**:
```json
POST /api/backtest/submit
{
  "symbols": ["AAPL", "MSFT"],
  "timeframe": "1mo",
  "interval": "1d",
  "code": "// JavaScript strategy code"
}
```

### Market Simulation (`/api/market-sim`)

User endpoints for trading in the simulated commodity market:

| Method | Endpoint            | Description               | Auth |
|--------|---------------------|---------------------------|------|
| GET    | `/portfolio`        | Get simulation portfolio  | Yes  |
| POST   | `/orders`           | Place simulation order    | Yes  |
| GET    | `/orders`           | Get simulation orders     | Yes  |
| GET    | `/assets`           | Get all sim assets        | No   |
| GET    | `/state`            | Get sim state             | No   |
| GET    | `/orderbook/:symbol`| Get orderbook             | No   |
| GET    | `/stocks`           | Get stock metadata        | No   |
| GET    | `/candles/:symbol`  | Get historical candles    | No   |
| GET    | `/news`             | Get news history          | No   |
| GET    | `/instruments`      | Get sim instruments       | No   |
| GET    | `/quote/:symbol`    | Get sim quote             | No   |

### Market Simulation Admin (`/api/market-sim/admin`)

| Method | Endpoint         | Description                   | Auth        |
|--------|------------------|-------------------------------|-------------|
| POST   | `/authenticate`  | Verify admin password         | No          |
| GET    | `/status`        | Get sim + backend status      | No          |
| POST   | `/delete`        | Delete all sim data           | Admin Pass  |
| POST   | `/populate`      | Populate historical data      | Admin Pass  |
| POST   | `/control`       | Control sim (start/stop/etc)  | Admin Pass  |
| POST   | `/news`          | Inject news event             | Admin Pass  |
| POST   | `/config`        | Update sim config             | Admin Pass  |
| GET    | `/instruments`   | List sim instruments          | No          |
| GET    | `/stats`         | Get DB row counts             | No          |

**Admin Authentication**:
```
Header: x-admin-password: manipulation
Body: { "password": "manipulation" }
Query: ?password=manipulation
```

---

## Database Schema

### Core Models

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────<│   Account   │────<│   Position  │
└─────────────┘     └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐     ┌─────────────┐
                    │    Order    │────<│    Trade    │
                    └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  Instrument │
                    └─────────────┘
```

### User
| Field          | Type      | Description              |
|----------------|-----------|--------------------------|
| id             | UUID      | Primary key              |
| email          | String    | Unique email             |
| passwordHash   | String    | Bcrypt hash (12 rounds)  |
| displayName    | String    | Display name             |
| isPublic       | Boolean   | Profile visibility       |
| currency       | String    | Preferred currency       |
| showOnLeaderboard| Boolean | Leaderboard eligibility  |
| activeMode     | Enum      | STANDARD/RANKED/SIMULATION |

### Account
| Field         | Type      | Description              |
|---------------|-----------|--------------------------|
| id            | UUID      | Primary key              |
| userId        | UUID      | Foreign key → User       |
| name          | String    | Account name             |
| mode          | Enum      | STANDARD/RANKED/SIMULATION|
| cashBalance   | Decimal   | Available cash           |
| initialBalance| Decimal   | Starting balance         |
| marginBalance | Decimal   | Margin available         |

### Instrument
| Field           | Type      | Description              |
|-----------------|-----------|--------------------------|
| id              | UUID      | Primary key              |
| symbol          | String    | Unique ticker symbol     |
| name            | String    | Company/asset name       |
| type            | Enum      | EQUITY/FUTURE/OPTION     |
| currency        | String    | Trading currency         |
| exchange        | String    | Exchange name            |
| lotSize         | Int       | Contract lot size        |
| isActive        | Boolean   | Trading enabled          |

### Order
| Field         | Type      | Description              |
|---------------|-----------|--------------------------|
| id            | UUID      | Primary key              |
| accountId     | UUID      | Foreign key → Account    |
| instrumentId  | UUID      | Foreign key → Instrument |
| orderType     | Enum      | MARKET/LIMIT             |
| side          | Enum      | BUY/SELL                 |
| quantity      | Decimal   | Order quantity           |
| limitPrice    | Decimal   | Limit price (if LIMIT)   |
| status        | Enum      | PENDING/FILLED/PARTIAL/CANCELLED/REJECTED |
| filledQty     | Decimal   | Quantity filled          |
| avgFillPrice  | Decimal   | Average fill price       |

### Enums

```prisma
enum AccountMode    { STANDARD, RANKED, SIMULATION }
enum InstrumentType { EQUITY, FUTURE, OPTION }
enum OptionType     { CALL, PUT }
enum Direction      { LONG, SHORT }
enum OrderType      { MARKET, LIMIT }
enum Side           { BUY, SELL }
enum OrderStatus    { PENDING, FILLED, PARTIAL, CANCELLED, REJECTED }
enum SimInterval    { M1, M5, M15, M30, H1, D1 }
```

### Market Simulation Models

**SimInstrument** - Commodity metadata
| Field            | Type     |
|------------------|----------|
| symbol           | String   |
| name             | String   |
| category         | String   |
| initialPrice     | Decimal  |
| baseVolatility   | Decimal  |

**SimCandle** - OHLCV data
| Field        | Type     |
|--------------|----------|
| instrumentId | UUID     |
| interval     | Enum     |
| timestamp    | BigInt   |
| open/high/low/close | Decimal |
| volume       | BigInt   |

**SimNews** - News events
| Field        | Type     |
|--------------|----------|
| instrumentId | UUID     |
| category     | Enum     |
| sentiment    | Enum     |
| headline     | String   |
| magnitude    | Decimal  |
| simTimestamp | BigInt   |

---

## Market Simulator Integration

### Architecture

```
┌─────────────┐     HTTP/REST      ┌──────────────────┐
│   Backend   │◄──────────────────►│  C++ Market Sim  │
│   (Node.js) │                    │    (Port 8080)   │
└──────┬──────┘                    └────────┬─────────┘
       │                                    │
       ▼                                    ▼
┌─────────────┐                    ┌──────────────────┐
│  PostgreSQL │                    │   In-Memory      │
│  (Persist)  │                    │   State          │
└─────────────┘                    └──────────────────┘
```

### Initialization Flow

1. Backend starts and waits for C++ engine (30 retries, 2s interval)
2. Push tuned configuration via `POST /config`
3. Reinitialize simulation (rebuild agents/commodities)
4. Populate historical data if not exists (200 days default)

### Sync Service

Runs every 30 seconds to sync:
- Candles (M1, M5, M15, H1, D1)
- News events
- State checkpoints

**Data Retention**:
| Interval | Retention |
|----------|-----------|
| M1       | Last 7 days |
| M5/M15/M30 | Last 60 days |
| H1/D1    | Unlimited |

### Proxied Endpoints

The backend proxies these requests to the C++ engine:

```
GET  /assets           → Current commodity prices
GET  /state            → Simulation state
GET  /orderbook/:sym   → Order book depth
GET  /stocks           → Commodity metadata
GET  /candles/:sym     → Live candle data
POST /orders           → Place order
POST /control          → Start/stop/pause/reset
POST /populate         → Generate history
POST /news             → Inject news event
```

---

## Configuration

### Environment Variables

```bash
# Server
NODE_ENV=development          # development | production
PORT=3000                     # Server port

# Database
DATABASE_URL="postgresql://decrypt:decrypt123@localhost:5432/decrypt?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Market Data
MARKET_DATA_PROVIDER=yahoo    # yahoo | mock

# Market Simulator
MARKET_SIM_URL="http://localhost:8080"
SIM_ADMIN_PASSWORD="manipulation"

# App
DEFAULT_STARTING_BALANCE=100000

# Frontend (CORS in production)
FRONTEND_URL="https://your-frontend.com"
```

### NPM Scripts

```bash
npm run dev          # Development with hot reload
npm start            # Production start
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
npm run db:seed      # Seed database
npm test             # Run tests
```

### Rate Limiting

- **Default**: 300 requests/minute
- **Exempt**: `/api/market-sim/*` routes

### CORS

- **Development**: All origins allowed
- **Production**: Restricted to `FRONTEND_URL`

---

## Development

### Prerequisites

- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- Prisma CLI

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Start development server
npm run dev
```

### Project Structure

```
backend/
├── src/
│   ├── app.js                    # Entry point
│   ├── plugins/
│   │   ├── prisma.js            # Database connection
│   │   ├── redis.js             # Redis cache
│   │   └── currency.js          # Currency conversion
│   ├── modules/
│   │   ├── auth/routes.js       # Auth endpoints
│   │   ├── instruments/routes.js
│   │   ├── market-data/routes.js
│   │   ├── orders/routes.js
│   │   ├── portfolio/routes.js
│   │   ├── leaderboard/routes.js
│   │   ├── profile/routes.js
│   │   ├── backtest/routes.js
│   │   └── market-sim/
│   │       ├── routes.js        # Sim trading
│   │       ├── admin.js         # Admin control
│   │       └── service.js       # Order execution
│   └── services/
│       ├── market/              # Market data providers
│       │   ├── index.js
│       │   ├── yahooAdapter.js
│       │   ├── mockAdapter.js
│       │   ├── simSyncService.js
│       │   └── simInitService.js
│       ├── backtest/
│       │   └── backtestRunner.js
│       ├── indicators/
│       │   └── indicators.js
│       ├── judge0/
│       │   └── judge0.js
│       └── currency/
│           └── index.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── package.json
└── Dockerfile
```

### Docker

```bash
# Build
docker build -t decrypt-backend .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  -e JWT_SECRET=... \
  decrypt-backend
```

---

## Account Modes

| Mode       | Description                          | Features                        |
|------------|--------------------------------------|---------------------------------|
| STANDARD   | Practice trading                     | Add funds, reset account        |
| RANKED     | Competition mode                     | Fixed balance, leaderboard      |
| SIMULATION | Commodity simulation trading         | Separate portfolio, sim data    |

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "statusCode": 400
}
```

Common status codes:
- `400` - Bad request (invalid input)
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `409` - Conflict (duplicate resource)
- `500` - Internal server error
