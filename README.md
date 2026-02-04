# Decrypt - Paper Trading Platform

A full-featured paper trading platform for learning stock market trading without risking real money.

## Features

- 📈 **Real-time Market Data** - TwelveData integration with mock fallback
- 💰 **Paper Trading** - Trade stocks with $100,000 virtual cash
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

### Quick Start

1. **Start the infrastructure** (PostgreSQL & Redis):
   ```bash
   cd docker
   docker-compose up -d postgres redis
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Setup database**:
   ```bash
   npm run db:push
   npm run db:seed
   ```

4. **Start the backend**:
   ```bash
   npm run dev
   ```

5. **Open the frontend**:
   Open `frontend/index.html` in your browser, or use a local server:
   ```bash
   cd frontend
   npx serve .
   ```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT tokens |
| `TWELVEDATA_API_KEY` | TwelveData API key (optional, mock data works without it) |

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

## Project Structure

```
decrypt/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── market-data/
│   │   │   ├── orders/
│   │   │   ├── portfolio/
│   │   │   ├── instruments/
│   │   │   ├── risk/
│   │   │   └── leaderboard/
│   │   ├── plugins/
│   │   └── app.js
│   └── prisma/
├── frontend/
│   ├── assets/
│   │   ├── styles.css
│   │   └── app.js
│   └── index.html
└── docker/
    └── docker-compose.yml
```

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

## Future Roadmap

- [ ] Options & Futures trading
- [ ] Real-time WebSocket updates
- [ ] Algorithm trading module
- [ ] Mobile app (PWA/Capacitor)
- [ ] Social features
- [ ] Trading competitions

## License

MIT
