# Decrypt - Paper Trading Platform

A full-featured paper trading platform for learning stock market trading without risking real money.

## Features

- 📈 **Real-time Market Data** - TwelveData integration with mock fallback
- 💰 **Paper Trading** - Trade stocks with virtual cash
- 👤 **Multiple Profiles** - Switch between Standard and Ranked trading modes
- 📊 **Portfolio Tracking** - Real-time P&L, positions, and trade history
- 🏆 **Leaderboard** - Compete with other traders
- 📉 **TradingView Charts** - Professional candlestick charts
- 🔐 **JWT Authentication** - Secure user accounts

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Auth**: JWT

### Frontend
- **Core**: HTML, CSS, JavaScript
- **Framework**: Alpine.js
- **Charts**: TradingView Lightweight Charts

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd decrypt
   ```

2. **Start the infrastructure** (PostgreSQL, Redis, & Backend):
   ```bash
   cd docker
   docker-compose up -d
   ```
   *This starts the database, cache, and the backend API service.*

3. **Install Dependencies (Local Development)**:
   If you want to run services locally outside of Docker:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   # (No npm install needed for frontend as it uses CDN scripts, but you might need a server)
   ```

4. **Setup Database (First time only)**:
   If running via Docker, the backend service usually handles migrations, but you can manually seed:
   ```bash
   cd backend
   npm run db:push
   npm run db:seed
   ```

5. **Start Frontend**:
   The frontend is a static site. You can serve it using `npx serve` or any static file server.
   ```bash
   cd frontend
   npx serve .
   ```
   Open http://localhost:3000 (or whatever port `serve` uses).

## Project Structure

This project is a Monorepo containing both the backend and frontend.

```
decrypt/           <-- Root
├── backend/       <-- Node.js API Service
├── frontend/      <-- Static Web Application
├── docker/        <-- Docker Configuration
└── ...
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Market Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/market/quote/:symbol` | Get real-time quote |
| GET | `/api/market/history/:symbol` | Get OHLC history |

### Trading
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/history` | Get order history |

### Portfolio
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio` | Get portfolio summary |
| GET | `/api/portfolio/positions` | Get positions |

### Leaderboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Get top traders |
| GET | `/api/leaderboard/me` | Get your rank |

## Development

### Running Tests
```bash
cd backend
npm test
```

### Database Migrations
```bash
npm run db:migrate
```

## License

MIT
