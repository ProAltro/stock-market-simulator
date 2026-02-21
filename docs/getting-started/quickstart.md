# Quick Start

Get Decrypt running locally in under 5 minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/) (for local development only)

## 1. Clone & Start

```bash
git clone https://github.com/ProAltro/stock-market-simulator.git
cd stock-market-simulator/docker
docker-compose up -d
```

This starts all services:

| Service | Port | Description |
|---------|------|-------------|
| **decrypt-app** | `:80` | Frontend + Backend + Market Sim |
| **judge0-server** | `:2358` | Code execution sandbox |
| **postgres** | internal | App database |
| **judge0-db** | internal | Judge0 database |
| **judge0-redis** | internal | Judge0 queue |

## 2. Access the Platform

Open [http://localhost](http://localhost) in your browser.

## 3. Create an Account

1. Click **Sign Up** in the sidebar
2. Enter email, password, and display name
3. You're ready to trade!

## 4. Submit Your First Algorithm

Navigate to the **Compete** page and paste:

```python
def run():
    for tick in range(get_tick_count()):
        price = get_price('OIL', tick)
        if tick > 100:
            prices = [get_price('OIL', t) for t in range(tick-50, tick)]
            avg = sum(prices) / len(prices)
            if price < avg * 0.98 and get_cash() > price * 10:
                buy('OIL', 10)
            elif price > avg * 1.02 and get_position('OIL') > 0:
                sell('OIL', min(10, get_position('OIL')))

run()
```

Click **Submit** and watch the leaderboard!

## Local Development (without Docker)

If you want to run services individually:

```bash
# Backend
cd backend
npm install
cp .env.example .env  # edit with your DB credentials
npm run db:push
npm run db:seed
npm run dev

# Frontend
cd frontend
npx serve .
```

!!! note
    Local development still requires PostgreSQL, Redis, and Judge0 running separately.
