# Writing Algorithms

This guide explains how to write trading algorithms for the Decrypt competition.

## How It Works

1. You write a Python or C++ algorithm
2. Your code runs against **1 million ticks** of commodity market data
3. You start with **$100,000** in cash
4. Your algorithm can buy and sell 5 commodities: OIL, STEEL, WOOD, BRICK, GRAIN
5. Final score = Cash + Σ(Position × Final Price)

## Algorithm Structure

Your algorithm is a script that iterates through ticks and makes trading decisions:

=== "Python"

    ```python
    def run():
        for tick in range(get_tick_count()):
            # Analyze data
            price = get_price('OIL', tick)
            
            # Make decisions
            if should_buy(price):
                buy('OIL', 10)
            elif should_sell(price):
                sell('OIL', get_position('OIL'))
    
    run()
    ```

=== "C++"

    ```cpp
    void run() {
        for (int tick = 0; tick < get_tick_count(); tick++) {
            double price = get_price("OIL", tick);
            
            if (should_buy(price)) {
                buy("OIL", 10);
            } else if (should_sell(price)) {
                sell("OIL", get_position("OIL"));
            }
        }
    }
    ```

## Available Data

For each tick, you have access to:

- **OHLCV prices** for all 5 commodities
- **Order book snapshots** (bids and asks)
- **News events** (category, sentiment, magnitude)
- **Your portfolio** (cash, positions)

## Tips

!!! tip "Performance"
    With 1M ticks, avoid heavy computation per tick. Pre-compute lookups where possible.

!!! tip "Diversification"
    Trading multiple commodities can reduce risk. Cross-commodity correlations exist in the simulation.

!!! tip "News Trading"
    News events directly affect agent behavior. Reacting to high-magnitude events can be profitable.

!!! warning "Execution Time"
    Algorithms have a timeout limit. Python algorithms should complete within ~60 seconds for 1M ticks.
