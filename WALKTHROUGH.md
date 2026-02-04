# Decrypt - Project Walkthrough

> **A comprehensive guide to understanding, running, and extending the Decrypt paper trading platform**

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [Architecture Overview](#architecture-overview)
4. [Database Design](#database-design)
5. [Backend Structure](#backend-structure)
6. [Frontend Structure](#frontend-structure)
7. [API Documentation](#api-documentation)
8. [Market Data System](#market-data-system)
9. [Development Workflow](#development-workflow)
10. [Deployment](#deployment)
11. [Future Enhancements](#future-enhancements)

---

## Project Overview

**Decrypt** is a full-featured paper trading platform that allows users to practice stock market trading without risking real money. Each user starts with $100,000 in virtual cash and can trade real stocks using live market data.

### Key Features
- 📈 Real-time market data (Yahoo Finance with mock fallback)
- 💰 Paper trading with virtual $100,000
- 📊 Portfolio tracking with real-time P&L
- 🏆 Public leaderboard system
- 📉 TradingView professional charts
- 🔐 JWT-based authentication
- 🚀 Fast and scalable architecture

### Tech Stack
- **Backend**: Node.js + Fastify + Prisma + PostgreSQL + Redis
- **Frontend**: Vanilla JavaScript + Alpine.js + TradingView Charts
- **Infrastructure**: Docker + Docker Compose

---

## Getting Started

### Prerequisites

Before you begin, ensure you have installed:
- **Node.js** 18+ ([download](https://nodejs.org/))
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop))
- A code editor (VS Code recommended)

### Step-by-Step Setup

#### 1. Clone and Navigate
```bash
git clone <repository-url>
cd decrypt
```

#### 2. Start Infrastructure Services
Start PostgreSQL and Redis using Docker Compose:
```bash
cd docker
docker-compose up -d postgres redis
```

This will:
- Start PostgreSQL on port `5433` (to avoid conflicts)
- Start Redis on port `6379`
- Create persistent volumes for data

#### 3. Setup Backend

```bash
cd ../backend
npm install
```

Create a `.env` file in the `backend/` directory:
```env
# Database
DATABASE_URL="postgresql://decrypt:decrypt123@localhost:5433/decrypt?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV="development"

# Market Data (optional - defaults to Yahoo Finance)
MARKET_DATA_PROVIDER="yahoo"  # Options: "yahoo" or "mock"
TWELVEDATA_API_KEY=""         # Optional if using TwelveData

# Frontend
FRONTEND_URL="http://localhost:8080"
```

#### 4. Initialize Database

```bash
# Push schema to database
npm run db:push

# Seed with initial data (popular stocks)
npm run db:seed
```

This seeds 20 popular stocks including AAPL, GOOGL, MSFT, etc.

#### 5. Start Backend Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with hot-reload enabled.

#### 6. Start Frontend

Open a new terminal:
```bash
cd frontend
npx serve .
# Or simply open index.html in your browser
```

Visit `http://localhost:3000` (or wherever serve opens it).

#### 7. Create an Account

1. Click "Register" in the auth modal
2. Enter email, display name, and password
3. Start trading with your $100,000 virtual cash!

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────┐
│   Browser   │
│  (Alpine.js)│
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────────┐
│          Fastify Backend                │
│  ┌────────────┐  ┌─────────────────┐   │
│  │   Routes   │  │   Middleware    │   │
│  │  Modules   │  │  (JWT, CORS,    │   │
│  └────────────┘  │   Rate Limit)   │   │
│         │        └─────────────────┘   │
│         ▼                               │
│  ┌────────────┐  ┌─────────────────┐   │
│  │  Services  │  │     Plugins     │   │
│  │  (Market)  │  │  (Prisma, Redis)│   │
│  └────────────┘  └─────────────────┘   │
└─────────────────────────────────────────┘
       │                     │
       ▼                     ▼
┌─────────────┐      ┌──────────────┐
│  PostgreSQL │      │    Redis     │
│  (Prisma)   │      │   (Cache)    │
└─────────────┘      └──────────────┘
       │
       ▼
┌────────────────────┐
│  Yahoo Finance API │
│   (Market Data)    │
└────────────────────┘
```

### Design Principles

1. **Separation of Concerns**: Each module handles a specific domain (auth, orders, portfolio, etc.)
2. **Plugin-Based Architecture**: Fastify plugins for database, cache, and auth
3. **Adapter Pattern**: Pluggable market data providers (Yahoo, Mock, etc.)
4. **Security First**: JWT authentication, rate limiting, input validation
5. **Caching Strategy**: Redis for market data caching (reduces API calls)
6. **Database Transactions**: Prisma transactions for atomic order execution

---

## Database Design

### Design Philosophy

The database schema is designed for a **real trading platform** with extensibility in mind:

- **Decimal precision**: All monetary values use `Decimal(20, 4)` for accuracy
- **Audit trails**: All tables have `createdAt` and `updatedAt` timestamps
- **Normalized structure**: Separation of Users, Accounts, Orders, Positions, Trades
- **Future-ready**: Support for options, futures, multiple accounts, OAuth

### Entity Relationship Diagram

```
┌─────────────┐
│    User     │
│ ----------- │
│ id (PK)     │
│ email       │◄──┐
│ displayName │   │
└─────────────┘   │
       │          │
       │ 1:N      │
       ▼          │
┌──────────────┐  │
│   Account    │  │
│ ------------ │  │
│ id (PK)      │  │
│ userId (FK)  │──┘
│ cashBalance  │
│ name         │
└──────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐     ┌──────────────┐
│   Position   │     │  Instrument  │
│ ------------ │     │ ------------ │
│ id (PK)      │     │ id (PK)      │
│ accountId(FK)│     │ symbol       │
│ instrumentId ├────►│ name         │
│ quantity     │     │ type         │
│ avgPrice     │     │ lotSize      │
│ direction    │     └──────────────┘
└──────────────┘            ▲
                            │
┌──────────────┐            │
│    Order     │            │
│ ------------ │            │
│ id (PK)      │            │
│ accountId(FK)│            │
│ instrumentId ├────────────┘
│ orderType    │
│ quantity     │
│ status       │
└──────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐
│    Trade     │
│ ------------ │
│ id (PK)      │
│ orderId (FK) │
│ execPrice    │
│ quantity     │
└──────────────┘
```

### Key Tables

#### 1. **Users**
- Primary authentication entity
- Links to multiple accounts (future support)
- `isPublic` flag for leaderboard visibility

#### 2. **Accounts**
- Each user has at least one trading account
- Tracks `cashBalance` and `marginBalance`
- Isolated trading environment

#### 3. **Instruments**
- Represents tradable securities
- Supports `EQUITY`, `FUTURE`, `OPTION` types
- Contains metadata (symbol, name, exchange)

#### 4. **Positions**
- Current holdings in an account
- `LONG` or `SHORT` direction
- Tracks average purchase price
- Unique constraint on (account, instrument, direction)

#### 5. **Orders**
- Trade requests (`MARKET` or `LIMIT`)
- Status tracking: `PENDING` → `FILLED` / `CANCELLED`
- Links to executed trades

#### 6. **Trades**
- Individual execution records
- Multiple trades can fulfill one order (partial fills)
- Immutable audit trail

### Database Decisions

#### Why Decimal(20, 4)?
Financial calculations require precision. JavaScript's `Number` type uses floating-point arithmetic which can cause rounding errors:
```javascript
0.1 + 0.2 === 0.30000000000000004  // ❌ Bad for money
```
We use PostgreSQL `DECIMAL` and Prisma's `Decimal.js` for exact arithmetic.

#### Why Separate Positions and Orders?
- **Positions**: Current state (what you own)
- **Orders**: Intent to trade (what you want to do)
- **Trades**: Historical record (what happened)

This separation allows for:
- Clear order lifecycle tracking
- Position rollup/aggregation
- Historical trade analysis

#### Why Support Both LONG and SHORT?
While this paper trading platform currently only supports long positions, the schema is designed to support **short selling** in the future:
- Short positions have negative quantity
- Separate tracking prevents confusion
- Risk calculations differ for long vs. short

#### Unique Constraint on Positions
```prisma
@@unique([accountId, instrumentId, direction])
```
Ensures only ONE position per stock per direction. Multiple buys aggregate into a single position with weighted average price.

---

## Backend Structure

### Directory Layout

```
backend/
├── src/
│   ├── app.js                 # Main application entry point
│   ├── plugins/               # Fastify plugins
│   │   ├── prisma.js         # Database connection
│   │   └── redis.js          # Cache connection
│   ├── modules/              # Business logic modules
│   │   ├── auth/
│   │   │   └── routes.js     # Authentication endpoints
│   │   ├── instruments/
│   │   │   └── routes.js     # Instrument listing
│   │   ├── market-data/
│   │   │   └── routes.js     # Real-time quotes & charts
│   │   ├── orders/
│   │   │   └── routes.js     # Order placement & history
│   │   ├── portfolio/
│   │   │   └── routes.js     # Portfolio & P&L
│   │   ├── leaderboard/
│   │   │   └── routes.js     # Top traders
│   │   └── profile/
│   │       └── routes.js     # User profile management
│   └── services/
│       └── market/
│           ├── index.js          # Market data service
│           ├── yahooAdapter.js   # Yahoo Finance integration
│           └── mockAdapter.js    # Mock data for dev/testing
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.js              # Initial data seeding
├── package.json
└── .env                     # Environment configuration
```

### Module Pattern

Each module follows a consistent structure:

```javascript
// modules/orders/routes.js
export default async function orderRoutes(fastify) {
  // All routes here are automatically prefixed with /api/orders
  
  // POST /api/orders - Place order
  fastify.post('/', {
    preHandler: [fastify.authenticate],  // Require authentication
  }, async (request, reply) => {
    // Business logic here
  });
  
  // GET /api/orders/history - Get order history
  fastify.get('/history', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Business logic here
  });
}
```

### Fastify Plugins

#### Prisma Plugin (`plugins/prisma.js`)
Registers Prisma Client as a Fastify decorator:
```javascript
app.prisma.user.findUnique(...)  // Available everywhere
```

#### Redis Plugin (`plugins/redis.js`)
Provides caching functionality:
```javascript
app.redis.get('market:AAPL')
app.redis.setex('market:AAPL', 60, data)  // 60s TTL
```

### Authentication Flow

1. User registers/logs in via `/api/auth/register` or `/api/auth/login`
2. Server validates credentials and generates JWT token
3. Token contains `userId` and `accountId`
4. Client includes token in `Authorization: Bearer <token>` header
5. Protected routes use `fastify.authenticate` preHandler
6. Request object is decorated with `request.user` containing decoded token

---

## Frontend Structure

### Single Page Application

The frontend is a vanilla JavaScript SPA using Alpine.js for reactivity:

```
frontend/
├── index.html              # Main HTML (contains all pages)
├── assets/
│   ├── app.js             # Alpine.js app logic & API calls
│   └── styles.css         # Complete styling
├── components/            # (Future: Reusable components)
└── pages/                 # (Future: Multi-page structure)
```

### Alpine.js State Management

```javascript
function app() {
  return {
    // Global state
    user: null,
    account: null,
    currentPage: 'dashboard',
    
    // Initialize app
    async init() {
      await this.loadUser();
      this.loadMarketData();
    },
    
    // API calls
    async api(endpoint, options = {}) {
      // Centralized fetch with JWT token
    }
  };
}
```

### Page Routing

All pages are in `index.html` with `x-show` directives:
```html
<div x-show="currentPage === 'dashboard'">Dashboard</div>
<div x-show="currentPage === 'trade'">Trading</div>
<div x-show="currentPage === 'portfolio'">Portfolio</div>
```

Navigation updates `currentPage` state.

### TradingView Charts

Uses TradingView Lightweight Charts for professional candlestick charts:
```javascript
const chart = LightweightCharts.createChart(container, options);
const candlestickSeries = chart.addCandlestickSeries();
candlestickSeries.setData(ohlcData);
```

---

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "John Doe"
}

Response: 201 Created
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "accountId": "uuid"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

Response: 200 OK
{
  "token": "...",
  "user": { ... }
}
```

### Market Data Endpoints

#### Get Quote
```http
GET /api/market/quote/AAPL
Authorization: Bearer <token>

Response: 200 OK
{
  "symbol": "AAPL",
  "price": 178.45,
  "change": 2.34,
  "changePercent": 1.33,
  "previousClose": 176.11,
  "open": 176.50,
  "high": 179.20,
  "low": 176.00,
  "volume": 65432100,
  "timestamp": "2026-02-04T15:30:00Z"
}
```

#### Get History
```http
GET /api/market/history/AAPL?interval=1d&range=1mo
Authorization: Bearer <token>

Response: 200 OK
{
  "symbol": "AAPL",
  "data": [
    {
      "time": "2026-01-05",
      "open": 170.00,
      "high": 172.50,
      "low": 169.00,
      "close": 171.80,
      "volume": 45678900
    },
    ...
  ]
}
```

### Trading Endpoints

#### Place Order
```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "symbol": "AAPL",
  "side": "BUY",
  "orderType": "MARKET",
  "quantity": 10
}

Response: 201 Created
{
  "order": {
    "id": "uuid",
    "symbol": "AAPL",
    "status": "FILLED",
    "filledQty": 10,
    "avgFillPrice": 178.45
  }
}
```

### Portfolio Endpoints

#### Get Portfolio
```http
GET /api/portfolio
Authorization: Bearer <token>

Response: 200 OK
{
  "accountValue": 105234.50,
  "cashBalance": 87654.30,
  "positionsValue": 17580.20,
  "totalPnL": 5234.50,
  "totalPnLPercent": 5.23,
  "positions": [
    {
      "symbol": "AAPL",
      "quantity": 10,
      "avgPrice": 171.50,
      "currentPrice": 178.45,
      "marketValue": 1784.50,
      "pnl": 69.50,
      "pnlPercent": 4.05
    }
  ]
}
```

---

## Market Data System

### Adapter Pattern

The market data system uses an **adapter pattern** for flexibility:

```javascript
// services/market/index.js
function getAdapter() {
  const provider = process.env.MARKET_DATA_PROVIDER || 'yahoo';
  return provider === 'mock' ? mockAdapter : yahooAdapter;
}
```

### Yahoo Finance Adapter

Uses `yahoo-finance2` npm package:
```javascript
import yahooFinance from 'yahoo-finance2';

export async function getQuote(symbol) {
  const quote = await yahooFinance.quote(symbol);
  return normalizeQuote(quote);
}
```

**Pros:**
- Free, no API key required
- Real-time data
- Reliable and fast

**Cons:**
- Unofficial API (could break)
- Rate limits on excessive usage

### Mock Adapter

Generates realistic fake data for development:
```javascript
export async function getQuote(symbol) {
  const basePrice = getBasePrice(symbol);  // AAPL = 175, GOOGL = 140, etc.
  const randomChange = (Math.random() - 0.5) * 5;
  return {
    symbol,
    price: basePrice + randomChange,
    // ... more mock data
  };
}
```

**Use cases:**
- Development without internet
- Testing edge cases
- Avoiding rate limits

### Caching Strategy

Market data is cached in Redis to reduce API calls:

```javascript
// Check cache first
const cached = await fastify.redis.get(`market:${symbol}`);
if (cached) return JSON.parse(cached);

// Fetch from API
const quote = await marketService.getQuote(symbol);

// Cache for 60 seconds
await fastify.redis.setex(`market:${symbol}`, 60, JSON.stringify(quote));
```

**Cache TTL:**
- Quotes: 60 seconds (real-time-ish)
- Historical data: 5 minutes (less volatile)

---

## Development Workflow

### Running in Development Mode

```bash
# Terminal 1: Infrastructure
cd docker
docker-compose up postgres redis

# Terminal 2: Backend (with hot-reload)
cd backend
npm run dev

# Terminal 3: Frontend
cd frontend
npx serve .
# Or just open index.html
```

### Database Migrations

When you modify `schema.prisma`:

```bash
# Option 1: Push changes directly (dev only)
npm run db:push

# Option 2: Create migration (production-ready)
npm run db:migrate
```

### Adding New Instruments

```bash
# Edit prisma/seed.js to add symbols
# Then re-run seed
npm run db:seed
```

### Testing Orders

1. Register a test account
2. Use market orders (instant fill)
3. Check portfolio for updated positions
4. Verify cash balance decreased

### Debugging Tips

#### Backend Issues
```bash
# Check logs
docker-compose logs backend

# Connect to database
docker exec -it decrypt-postgres psql -U decrypt -d decrypt
\dt  # List tables
SELECT * FROM users;
```

#### Redis Cache Issues
```bash
# Connect to Redis
docker exec -it decrypt-redis redis-cli
KEYS *           # List all keys
GET market:AAPL  # Get cached quote
FLUSHALL         # Clear cache (testing)
```

#### API Testing
Use curl or Postman:
```bash
# Health check
curl http://localhost:3000/health

# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","displayName":"Test"}'
```

---

## Deployment

### Quick Start Commands

#### Start the Backend (Docker)

```bash
cd docker
docker-compose up -d
```

This starts PostgreSQL, Redis, and the Backend container. The backend will be available at `http://localhost:3000`.

To start only specific services:
```bash
# Start just the database and cache
docker-compose up -d postgres redis

# Start the backend container (requires postgres and redis running)
docker-compose up -d backend
```

To rebuild the backend after code changes:
```bash
docker-compose up -d --build backend
```

#### Start the Frontend

From the project root:
```bash
cd frontend
npx serve .
```

The frontend will be served at `http://localhost:3000` (or another available port). Open this URL in your browser.

Alternatively, you can simply open `frontend/index.html` directly in your browser.

### Docker Production Build

The project includes a complete Docker setup:

```bash
cd docker
docker-compose up -d
```

This will:
1. Build the backend Docker image
2. Start PostgreSQL, Redis, and Backend
3. Run migrations automatically
4. Expose backend on port 3000

### Environment Variables (Production)

Create a `.env` file in `docker/`:
```env
JWT_SECRET=<strong-random-secret>
MARKET_DATA_PROVIDER=yahoo
FRONTEND_URL=https://yourdomain.com
DATABASE_URL=postgresql://decrypt:decrypt123@postgres:5432/decrypt
REDIS_URL=redis://redis:6379
```

### Frontend Deployment

Static files can be deployed to:
- **Netlify**: Drag & drop `frontend/` folder
- **Vercel**: Connect GitHub repo
- **S3 + CloudFront**: Upload files
- **GitHub Pages**: Push to `gh-pages` branch

Update `frontend/assets/app.js` with production API URL:
```javascript
const API_BASE = 'https://api.yourdomain.com/api';
```

### Production Checklist

- [ ] Change `JWT_SECRET` to strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for your domain
- [ ] Set up database backups
- [ ] Monitor Redis memory usage
- [ ] Set up logging/monitoring (e.g., Sentry)
- [ ] Rate limiting configuration
- [ ] Load testing

---

## Future Enhancements

### Planned Features

1. **Advanced Order Types**
   - Stop-loss orders
   - Trailing stop-loss
   - OCO (One-Cancels-Other)
   - Bracket orders

2. **Options Trading**
   - Schema already supports options
   - Implement Black-Scholes pricing
   - Greeks calculation (Delta, Gamma, etc.)

3. **Short Selling**
   - Already supported in schema (`SHORT` direction)
   - Implement margin requirements
   - Borrow fee calculation

4. **Social Features**
   - Follow traders
   - Copy trades
   - Discussion forums
   - Trade sharing

5. **Portfolio Analytics**
   - Sharpe ratio
   - Max drawdown
   - Win rate statistics
   - Sector allocation

6. **Mobile App**
   - React Native app
   - Push notifications for filled orders
   - Price alerts

7. **Websockets**
   - Real-time order updates
   - Live portfolio value
   - Price streaming

8. **AI Advisor**
   - Portfolio recommendations
   - Risk alerts
   - Trade suggestions

### Technical Improvements

- Add unit tests (Vitest/Jest)
- Add E2E tests (Playwright)
- Implement GraphQL API
- Add OpenAPI/Swagger docs
- Set up CI/CD pipeline
- Database query optimization
- Frontend componentization
- TypeScript migration

---

## Troubleshooting

### Common Issues

#### "Cannot connect to database"
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Restart container
docker-compose restart postgres
```

#### "Redis connection failed"
```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
docker exec -it decrypt-redis redis-cli ping
```

#### "Market data not loading"
Switch to mock provider:
```env
MARKET_DATA_PROVIDER=mock
```

#### "Orders not executing"
Check:
1. Sufficient cash balance
2. Instrument exists in database
3. Valid symbol format
4. Backend logs for errors

---

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[Your License Here]

---

## Support

For questions or issues:
- Open a GitHub issue
- Email: support@decrypt.com
- Discord: [Your Discord]

---

**Happy Trading! 🚀📈**

*Remember: This is paper trading. No real money is at risk. Use this platform to learn and experiment before trading with real capital.*
