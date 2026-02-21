# Market Data API

Market data endpoints proxy requests to the C++ market simulation engine. All endpoints are prefixed with `/api/market`.

## Market Status

Get the current state of the market simulation.

```
GET /api/market/status
```

**Response** `200 OK`:

```json
{
  "running": true,
  "currentTick": 54321,
  "totalTicks": 1000000,
  "commodities": [
    {
      "symbol": "OIL",
      "price": 75.42,
      "change": 0.85,
      "volume": 12450
    }
  ],
  "timestamp": "2025-06-15T14:30:00.000Z"
}
```

**Errors:**

| Status | Description |
|--------|-------------|
| 503 | Market simulation unavailable |

---

## Order Book

Get the current order book for a commodity.

```
GET /api/market/orderbook/:symbol
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbol` | string | Commodity symbol (e.g., `OIL`) |

**Response** `200 OK`:

```json
{
  "symbol": "OIL",
  "bids": [
    { "price": 75.40, "quantity": 100 },
    { "price": 75.38, "quantity": 250 }
  ],
  "asks": [
    { "price": 75.42, "quantity": 150 },
    { "price": 75.45, "quantity": 300 }
  ]
}
```

!!! note
    Agent IDs are stripped from the response — only `price` and `quantity` are exposed.

---

## Candles (OHLCV)

Get candlestick data for a commodity.

```
GET /api/market/candles/:symbol
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `symbol` | string | Commodity symbol |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `interval` | string | `1m` | Candle interval |
| `limit` | number | `100` | Number of candles |
| `since` | string | — | ISO 8601 timestamp |

**Supported Intervals:**

| Interval | Description |
|----------|-------------|
| `1m` | 1 minute |
| `5m` | 5 minutes |
| `15m` | 15 minutes |
| `1h` | 1 hour |
| `4h` | 4 hours |
| `1d` | 1 day |

**Response** `200 OK`:

```json
{
  "symbol": "OIL",
  "interval": "5m",
  "candles": [
    {
      "timestamp": "2025-06-15T14:25:00.000Z",
      "open": 75.30,
      "high": 75.50,
      "low": 75.28,
      "close": 75.42,
      "volume": 1850
    }
  ]
}
```
