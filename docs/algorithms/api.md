# Strategy API Reference

These functions are available inside your trading algorithm.

## Data Access

### `get_commodities()`
Returns list of tradable commodity symbols.

```python
symbols = get_commodities()
# ['OIL', 'STEEL', 'WOOD', 'BRICK', 'GRAIN']
```

### `get_tick_count()`
Returns total number of ticks (1,000,000).

```python
total = get_tick_count()  # 1000000
```

### `get_current_tick()`
Returns the current tick being processed (0 to 999,999).

### `get_price(symbol, tick=None)`
Get the close price for a commodity at a specific tick. If `tick` is `None`, returns the current tick's price.

```python
oil_price = get_price('OIL', 500)    # Price at tick 500
current = get_price('OIL')            # Current tick's price
```

### `get_ohlcv(symbol, start_tick=None, end_tick=None)`
Get OHLCV (Open, High, Low, Close, Volume) data for a range of ticks.

```python
data = get_ohlcv('OIL', 0, 100)
# [{'tick': 0, 'open': 75.0, 'high': 75.1, 'low': 74.9, 'close': 75.05, 'volume': 1000}, ...]
```

### `get_orderbook(symbol, tick)`
Get the order book snapshot at a specific tick.

```python
book = get_orderbook('OIL', 500)
# {'bids': [{'price': 75.40, 'quantity': 100}, ...],
#  'asks': [{'price': 75.44, 'quantity': 150}, ...]}
```

### `get_news(tick)`
Get news events at a specific tick.

```python
news = get_news(500)
# [{'symbol': 'OIL', 'category': 'Geopolitical', 'sentiment': 'negative',
#   'magnitude': 0.8, 'headline': '...'}]
```

---

## Account & Position

### `get_cash()`
Returns current cash balance.

```python
cash = get_cash()  # 100000.0
```

### `get_positions()`
Returns dictionary of all positions.

```python
positions = get_positions()
# {'OIL': 100, 'STEEL': 0, 'WOOD': 50, 'BRICK': 0, 'GRAIN': 0}
```

### `get_position(symbol)`
Returns quantity held for a specific commodity.

```python
oil_qty = get_position('OIL')  # 100
```

---

## Trading

### `buy(symbol, quantity)`
Buy a commodity at the current market price.

```python
buy('OIL', 10)  # Buy 10 units of OIL
```

- Deducts `quantity × current_price` from cash
- Fails silently if insufficient cash

### `sell(symbol, quantity)`
Sell a commodity at the current market price.

```python
sell('OIL', 5)  # Sell 5 units of OIL
```

- Adds `quantity × current_price` to cash
- Fails silently if insufficient position

---

## Scoring

$$\text{Net Worth} = \text{Cash} + \sum_{\text{symbol}} \text{Position}_{\text{symbol}} \times \text{FinalPrice}_{\text{symbol}}$$

Your final net worth after all 1M ticks determines your leaderboard ranking.
