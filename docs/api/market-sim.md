# Market Simulation API

The C++ market simulation engine exposes a REST API on port **8080**. These endpoints are used internally by the backend and can also be accessed directly.

## Health Check

```
GET /health
```

**Response** `200 OK`:

```json
{
  "status": "ok",
  "uptime": 3600
}
```

---

## Simulation State

```
GET /state
```

**Response** `200 OK`:

```json
{
  "running": true,
  "currentTick": 54321,
  "ticksPerDay": 1440,
  "currentDate": "2025-03-15",
  "totalAgents": 68,
  "totalTrades": 128450
}
```

---

## Commodities

```
GET /commodities
```

**Response** `200 OK`:

```json
[
  {
    "symbol": "OIL",
    "name": "Crude Oil",
    "category": "Energy",
    "price": 75.42,
    "bid": 75.40,
    "ask": 75.44,
    "volume": 12450,
    "change": 0.85
  }
]
```

---

## Order Book

```
GET /orderbook/:symbol
```

**Response** `200 OK`:

```json
{
  "symbol": "OIL",
  "bids": [
    { "price": 75.40, "quantity": 100, "agentId": 12 }
  ],
  "asks": [
    { "price": 75.44, "quantity": 150, "agentId": 7 }
  ]
}
```

!!! warning
    The backend strips `agentId` before forwarding to users. Access this endpoint directly only for debugging.

---

## Candles

```
GET /candles/:symbol?interval=5m&limit=100&since=2025-01-01T00:00:00Z
```

See [Market Data API](market.md#candles-ohlcv) for details on intervals and parameters.

---

## News

```
GET /news?limit=50&tick=1000
```

**Response** `200 OK`:

```json
[
  {
    "tick": 1000,
    "symbol": "OIL",
    "category": "Geopolitical",
    "sentiment": "negative",
    "magnitude": 0.8,
    "headline": "Trade tensions rise in key oil-producing region"
  }
]
```

---

## Simulation Control

```
POST /control
```

**Request Body:**

```json
{
  "action": "start" | "stop" | "reset" | "populate"
}
```

| Action | Description |
|--------|-------------|
| `start` | Start/resume the simulation |
| `stop` | Pause the simulation |
| `reset` | Reset to initial state |
| `populate` | Generate N ticks of data |

---

## Configuration

### Get Config

```
GET /config
```

### Update Config

```
PUT /config
```

**Request Body:**

```json
{
  "ticksPerDay": 1440,
  "agentCount": 68,
  "circuitBreakerThreshold": 0.10
}
```

---

## SSE Stream

Real-time event stream of simulation updates.

```
GET /stream
```

**Event Types:**

- `tick` — New tick processed
- `trade` — Trade executed
- `news` — News event generated
- `state` — State change (start/stop)
