# Data Management API

Endpoints for managing market simulation data bundles. All endpoints are prefixed with `/api/data`.

## Data Info

Get information about available data bundles.

```
GET /api/data/info
```

**Response** `200 OK`:

```json
{
  "commodities": ["OIL", "STEEL", "WOOD", "BRICK", "GRAIN"],
  "totalTicks": 1000000,
  "bundles": {
    "full_1m": {
      "exists": true,
      "sizeBytes": 524288000
    },
    "dev_100k": {
      "exists": true,
      "sizeBytes": 52428800
    }
  }
}
```

---

## Data Status

Get the status of data generation/sync.

```
GET /api/data/status
```

**Response** `200 OK`:

```json
{
  "generating": false,
  "lastSync": "2025-06-15T14:00:00.000Z",
  "ticksAvailable": 1000000
}
```

---

## Generate Data

Trigger data generation from the market simulation.

```
POST /api/data/generate
```

**Request Body:**

```json
{
  "ticks": 1000000,
  "format": "json"
}
```

---

## Download Data

Download a data bundle as a ZIP archive.

```
GET /api/data/download
```

**Response:** `application/zip` binary stream

---

## Sample Data

Get a small sample of market data for preview.

```
GET /api/data/sample
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `lines` | number | 100 | Number of data lines to return |

**Response** `200 OK`:

```json
{
  "sample": "tick,symbol,open,high,low,close,volume\n0,OIL,75.00,75.12,74.95,75.05,1000\n..."
}
```
