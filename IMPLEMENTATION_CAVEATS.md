# Implementation Caveats & Technical Constraints

## 1. Yahoo Finance API (Unofficial)

### Intraday Data Limitations
The application uses the unofficial Yahoo Finance API (via `yahoo-finance2`) for market data. There are strict limitations on historical intraday data availability. If these limits are exceeded, the API silently falls back to returning **daily** data, which breaks chart rendering.

To prevent this, the backend (`yahooAdapter.js`) strictly enforces the following date range clamps:

| Interval | Max Range | Implemented Limit | Notes |
|----------|-----------|-------------------|-------|
| `1m`     | 7 days    | 5 days            | Very strictly limited. |
| `5m`     | 60 days   | 55 days           | Exceeding 60d returns daily data. |
| `15m`    | 60 days   | 55 days           | Shared limit with other intraday. |
| `30m`    | 60 days   | 55 days           | |
| `1h`     | 730 days  | 700 days (~2y)    | |

**Consequence:**
- You cannot view 5-minute candle charts for data older than ~60 days.
- You cannot view 1-minute candle charts for data older than ~5-7 days.
- Zooming out too far on an intraday chart will result in the chart stopping at the limit.

### API Rate Limiting
Yahoo Finance may rate limit IP addresses making excessive requests. The application includes some basic error handling, but heavy automated testing or high-frequency polling from a single IP may trigger temporary bans.

## 2. Docker Networking
- The backend communicates with PostgreSQL via the `postgres` service name internally on port 5432.
- The host machine accesses PostgreSQL via port 5433 (mapped in `docker-compose.yml`).
- If `DATABASE_URL` is misconfigured to use `localhost` inside the container, connection will fail.

## 3. Frontend Charting
- The Lightweight Charts library is used for rendering.
- It expects strictly sorted time data (ascending). The backend ensures this sorting.
- Intraday time must be Unix timestamps (seconds), while daily data uses `YYYY-MM-DD` strings. The backend handles this conversion based on the interval type.
