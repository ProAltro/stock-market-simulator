# Configuration

All configuration is done via environment variables.

## Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment (`development`, `production`) |
| `PORT` | `3000` | Backend HTTP port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `dev-secret-change-me` | JWT signing secret |
| `JWT_EXPIRY` | `7d` | Token expiration |
| `MARKET_SIM_URL` | `http://localhost:8080` | Market sim API URL |
| `JUDGE0_URL` | `http://localhost:2358` | Judge0 API URL |
| `DATA_DIR` | `/data` | Path to market data exports |
| `FRONTEND_URL` | `http://localhost` | CORS allowed origin |
| `LOG_LEVEL` | `info` | Pino log level |

## Docker Compose Variables

Set in `docker/.env` or pass via environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `change-me-in-production` | **Must change in production** |
| `POSTGRES_USER` | `decrypt` | Database user |
| `POSTGRES_PASSWORD` | `decrypt123` | Database password |
| `POSTGRES_DB` | `decrypt` | Database name |

## Market Simulation Config

Runtime configuration via the `/config` API endpoint or `tune_sim.js`:

| Setting | Default | Description |
|---------|---------|-------------|
| `ticksPerDay` | 72,000 | Ticks per simulated day (live mode) |
| `populateTicksPerDay` | 576 | Ticks per day during coarse populate |
| `circuitBreakerThreshold` | 0.10 | Max daily price move (10%) |
| `populate` | 100 days | Historical data generated on startup |

Wait ~1-2 minutes for market sim population on first start (configurable via `--populate` days in `supervisord.conf`).

## Judge0 Configuration

Set in `docker/judge0.conf`:

| Variable | Description |
|----------|-------------|
| `REDIS_PASSWORD` | Judge0 Redis password |
| `POSTGRES_HOST` | Judge0 DB host |
| `POSTGRES_PASSWORD` | Judge0 DB password |
| `CPU_TIME_LIMIT` | Max CPU seconds per submission |
| `MAX_PROCESSES_AND_OR_THREADS` | Process limit |

## Rate Limiting

Global rate limit: **100 requests per minute** per IP address.

Configured in `src/app.js` via `@fastify/rate-limit`.

## CORS

- **Development**: All origins allowed
- **Production**: Only `FRONTEND_URL` origin allowed
- Credentials (cookies/auth headers) always allowed

## Security Checklist

!!! danger "Production Deployment"
    - [ ] Change `JWT_SECRET` from the default
    - [ ] Change `POSTGRES_PASSWORD` from `decrypt123`
    - [ ] Set `NODE_ENV=production`
    - [ ] Configure `FRONTEND_URL` for your domain
    - [ ] Use HTTPS (add TLS termination to nginx)
    - [ ] Restrict Judge0 network access
