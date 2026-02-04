# Decrypt Platform Roadmap & Todo

This document tracks the feature gaps identified between Decrypt and traditional trading platforms.

## 1. Advanced Order Types
- [ ] **Stop Loss Orders**: Implement trigger price logic to protect downside.
- [ ] **Stop Limit Orders**: Precise entry/exit control.
- [ ] **Trailing Stop**: Dynamic stop loss that follows price movement.
- [ ] **Bracket Orders**: entry + take profit + stop loss in one ticket.
- [ ] **OCO (One Cancels Other)**: Link two orders where execution of one cancels the other.
- [ ] **Short Selling**: Robust margin check and borrowing logic (currently partial).

## 2. Professional Charting (Frontend)
- [ ] **Technical Indicators**: Add RSI, MACD, Moving Averages (EMA/SMA), Bollinger Bands.
- [ ] **Drawing Tools**: Support for trendlines and fib levels.
- [ ] **Custom Timeframes**: Support non-standard intervals (e.g., 2h, 4h).
- [ ] **Multi-Chart Layouts**: Split view to compare assets.

## 3. Market Data & Depth
- [ ] **Level 2 Data (Order Book)**: Visualize buy/sell depth.
- [ ] **Times & Sales (Tape)**: Real-time feed of executed trades.
- [ ] **WebSocket Streaming**: Replace polling with real-time push updates.

## 4. Risk & Account Management
- [ ] **Margin Trading**: Leverage, maintenance margin, and liquidation engine.
- [ ] **Performance Analytics**: Sharpe Ratio, daily P&L charts, win/loss ratio.
- [ ] **Tax Optimization**: FIFO/LIFO lot selection settings.

## 5. Social & News
- [ ] **News Feed**: Integration with financial news API tailored to holdings.
- [ ] **Analyst Ratings**: Display consensus ratings (Strong Buy/Sell).
- [ ] **Community Features**: Chat or copy-trading capabilities.
