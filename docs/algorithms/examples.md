# Example Strategies

## Simple Momentum

Buy when price rises above its moving average, sell when it drops below.

```python
def run():
    lookback = 100

    for tick in range(get_tick_count()):
        if tick < lookback:
            continue

        for symbol in get_commodities():
            prices = [get_price(symbol, t) for t in range(tick - lookback, tick)]
            avg = sum(prices) / len(prices)
            current = prices[-1]
            position = get_position(symbol)

            if current > avg * 1.02 and position == 0:
                qty = int(get_cash() / current / 5)  # allocate 20% per commodity
                if qty > 0:
                    buy(symbol, qty)
            elif current < avg * 0.98 and position > 0:
                sell(symbol, position)

run()
```

---

## Mean Reversion

Buy when price dips below the moving average, sell when it recovers.

```python
def run():
    lookback = 200

    for tick in range(get_tick_count()):
        if tick < lookback:
            continue

        for symbol in get_commodities():
            prices = [get_price(symbol, t) for t in range(tick - lookback, tick)]
            avg = sum(prices) / len(prices)
            std = (sum((p - avg) ** 2 for p in prices) / len(prices)) ** 0.5
            current = get_price(symbol, tick)
            position = get_position(symbol)

            # Buy when >1.5 std deviations below mean
            if current < avg - 1.5 * std and position == 0:
                qty = int(get_cash() / current / 5)
                if qty > 0:
                    buy(symbol, qty)
            # Sell when price returns to mean
            elif current > avg and position > 0:
                sell(symbol, position)

run()
```

---

## News-Driven Strategy

React to high-impact news events.

```python
def run():
    for tick in range(get_tick_count()):
        news = get_news(tick)

        for event in news:
            symbol = event['symbol']
            magnitude = event['magnitude']
            sentiment = event['sentiment']
            position = get_position(symbol)

            if magnitude > 0.7:
                if sentiment == 'positive' and position == 0:
                    qty = int(get_cash() * 0.3 / get_price(symbol, tick))
                    if qty > 0:
                        buy(symbol, qty)
                elif sentiment == 'negative' and position > 0:
                    sell(symbol, position)

run()
```

---

## Multi-Commodity Diversified

Spread capital across all commodities with periodic rebalancing.

```python
def run():
    symbols = get_commodities()
    rebalance_interval = 10000  # rebalance every 10k ticks

    for tick in range(get_tick_count()):
        if tick == 0 or (tick % rebalance_interval == 0 and tick > 0):
            # Sell everything first (except on first tick)
            if tick > 0:
                for sym in symbols:
                    pos = get_position(sym)
                    if pos > 0:
                        sell(sym, pos)

            # Buy equal weight
            cash_per = get_cash() / len(symbols)
            for sym in symbols:
                price = get_price(sym, tick)
                qty = int(cash_per / price)
                if qty > 0:
                    buy(sym, qty)

run()
```
