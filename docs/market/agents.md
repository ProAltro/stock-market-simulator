# Trading Agents

The market simulation runs **68 autonomous AI agents** that collectively generate realistic market microstructure. Each agent independently evaluates the current market state and decides whether to place buy or sell limit orders.

## Agent Population

| Agent Type | Count | Strategy | Role in Market |
|-----------|-------|----------|----------------|
| **SupplyDemand** | 15 | Tracks the fundamental supply/demand balance of each commodity | Price discovery based on fundamentals |
| **Momentum** | 10 | Follows price trends — buys in uptrends, sells in downtrends | Amplifies trends, creates momentum |
| **MeanReversion** | 10 | Bets on prices returning to historical averages | Provides mean-reverting pressure, dampens extremes |
| **Noise** | 8 | Semi-random trading with sentiment-influenced bias | Provides baseline liquidity and realistic noise |
| **MarketMaker** | 5 | Continuously quotes both bid and ask sides of the book | Provides the spread, ensures continuous liquidity |
| **CrossEffects** | 8 | Trades based on inter-commodity correlations | Creates realistic cross-commodity price dynamics |
| **Inventory** | 6 | Manages portfolio balance across commodities | Adds rebalancing flow and diversification pressure |
| **Event** | 6 | Reacts strongly to news events | Creates sharp moves on news, adds event-driven dynamics |

**Total: 68 agents**, each with independent cash, positions, and decision-making logic.

## Agent Lifecycle

Every tick, each agent goes through:

1. **Evaluate** — receives current `MarketState` containing all commodity prices, orderbook snapshots, recent trades, and recent news
2. **Decide** — runs its strategy logic and may return an `Order` (or nothing)
3. **Order sizing** — calculates quantity based on cash, risk aversion, and confidence
4. **Submit** — order is placed into the relevant commodity's order book

## How Each Agent Type Works

### SupplyDemand Agents (15)

These are the **fundamental value** traders. They estimate fair price from the supply/demand imbalance of each commodity.

- If `production > consumption` (oversupply) → price should be lower → sells
- If `consumption > production` (undersupply) → price should be higher → buys
- Order aggressiveness scales with the magnitude of the imbalance
- Sensitivity to imbalance is configurable via `supplyDemandOverreaction`

### Momentum Agents (10)

Follow price trends using a lookback window.

- Calculates the recent return over N ticks
- If return exceeds a threshold → buys (trend-following)
- If return is below negative threshold → sells
- Creates positive feedback loops that can amplify moves
- Configurable via `momentumLookback` and `momentumThreshold`

### MeanReversion Agents (10)

Counter-trend traders that bet on prices returning to average.

- Calculates the deviation of current price from a rolling mean
- If price is significantly above mean → sells
- If price is significantly below mean → buys
- Provides stabilizing force against runaway trends

### Noise Traders (8)

Semi-random participants that inject realistic noise into the market.

- Base buy probability is 50%, shifted by the agent's accumulated sentiment
- `buyProb = 0.5 + sentimentBias × weight + Normal(0, noise_std)`
- Can only sell what they currently own (inventory-constrained)
- Provide baseline liquidity and make the market feel "alive"
- Configurable via `noiseTraderBuySellWeight` and `noiseTraderBuyNeutral`

### Market Makers (5)

Always-on liquidity providers that quote both sides of the book.

- Place simultaneous bid and ask orders around the current mid-price
- Spread width is configurable and adapts to volatility
- Seeded with initial inventory in all commodities so they can quote from tick 1
- Create the tight bid-ask spreads visible in the orderbook
- Configurable via `marketMakerSpread` and `marketMakerInitialInventory`

### CrossEffects Agents (8)

Exploit inter-commodity correlations defined in the cross-effects matrix.

- Monitor price movements in correlated commodities
- If OIL rises significantly and OIL→STEEL coefficient is 0.25, they buy STEEL
- Create realistic multi-commodity dynamics where moves in one market ripple to others

### Inventory Agents (6)

Portfolio rebalancers that maintain target allocations.

- Track their position sizes across all commodities
- If overweight in one commodity → sell to rebalance
- If underweight → buy to fill
- Adds flow that isn't purely speculative

### Event Agents (6)

React strongly and quickly to news events.

- When news hits, immediately adjust trading based on the event's sentiment and magnitude
- Positive supply news → sell (expecting price drop from more supply)
- Positive demand news → buy (expecting price rise)
- Higher `eventImpact` makes reactions more aggressive

## Agent Cash and Capital

All agents start with cash drawn from a normal distribution:

- **Mean**: $100,000
- **Standard deviation**: $30,000

This gives a realistic distribution of agent sizes, from small ($40K) to large ($160K+) participants.

### Order Sizing

When an agent decides to trade, the order quantity is determined by:

```
capitalFraction = configurable base fraction / riskAversion
maxSpend = cash × min(capitalFraction × confidence, 5%)
size = maxSpend / currentPrice
size = min(size, maxOrderSize)
size = max(size, 1)
```

Key constraints:

- No agent can spend more than 5% of their cash on a single order
- Orders are capped at `maxOrderSize` (configurable, default 500 units)
- Risk aversion varies per agent (0.5 to 2.0), creating heterogeneous sizing

## Sentiment System

Every agent maintains an internal **sentiment** value that decays toward zero over time.

- News events update sentiment based on the event's magnitude and relevance
- Sentiment influences trading decisions (e.g., positive sentiment → more likely to buy)
- Decay rate is configurable — faster decay means shorter-lived reactions to news
- Global sentiment affects all agents equally; commodity-specific sentiment only affects agents trading that commodity
