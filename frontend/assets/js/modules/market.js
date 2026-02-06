import { API_URL } from "../api.js";

export const marketModule = {
    selectedSymbol: "AAPL",
    currentQuote: null,
    searchQuery: "",
    searchResults: [],
    selectedExchange: "",
    watchlist: [],
    
    // Chart State
    chart: null,

    chartTimeframe: "1m",
    manualInterval: "", // Check for granularity override
    chartType: "candle",

    async fetchWatchlist() {
        // Load some default symbols
        const symbols = ["AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA"];
        this.watchlist = [];

        for (const symbol of symbols) {
            try {
                const res = await fetch(`${API_URL}/market/quote/${symbol}`);
                const quote = await res.json();
                this.watchlist.push(quote);
            } catch (err) {
                console.error(`Failed to fetch quote for ${symbol}:`, err);
            }
        }
    },

    async selectSymbol(symbol) {
        this.selectedSymbol = symbol;
        this.searchResults = [];
        this.searchQuery = "";

        // Fetch current quote
        try {
            const res = await fetch(`${API_URL}/market/quote/${symbol}`);
            this.currentQuote = await res.json();
        } catch (err) {
            console.error("Failed to fetch quote:", err);
        }

        // Load chart
        await this.loadChart();
    },

    async searchInstruments() {
        if (this.searchQuery.length < 1) {
            this.searchResults = [];
            return;
        }

        try {
            let url = `${API_URL}/instruments/search?q=${encodeURIComponent(this.searchQuery)}`;
            if (this.selectedExchange) {
                url += `&exchange=${encodeURIComponent(this.selectedExchange)}`;
            }
            const res = await fetch(url);
            this.searchResults = await res.json();
        } catch (err) {
            console.error("Search failed:", err);
        }
    },

    async loadChart() {
        const container = document.getElementById("chart-container");
        if (!container) return;

        // Show loading state
        // Use a dark theme loading message
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#787b86;background:#131722;">Loading chart...</div>';

        // Clean up previous chart if exists
        if (this.chart) {
            try {
                this.chart.remove();
            } catch (e) {
                // Chart already removed
            }
            this.chart = null;
        }

        // Map timeframe to API params compatible with Yahoo Finance
        // Yahoo Finance interval limits:
        // - 1m: max 7 days
        // - 5m, 15m, 30m: max 60 days
        // - 1h: max 730 days (~2 years)
        // - 1d: unlimited
        const timeframeMap = {
            "1d": { interval: "5m", range: "1d" },    // 1 day view: 5-minute candles
            "1w": { interval: "15m", range: "5d" },   // 1 week view: 15-minute candles
            "1m": { interval: "1h", range: "1mo" },   // 1 month view: 1-hour candles
            "3m": { interval: "1d", range: "3mo" },   // 3 month view: daily candles
            "1y": { interval: "1d", range: "1y" },    // 1 year view: daily candles
        };
        const params = timeframeMap[this.chartTimeframe] || timeframeMap["1m"];
        
        // Allow manual granularity override from dropdown
        // If user selected a specific interval, use it; otherwise use auto-calculated
        let interval = params.interval;
        let range = params.range;
        
        if (this.manualInterval) {
            interval = this.manualInterval;
            // Adjust range based on interval to get reasonable data
            // For intraday intervals, ensure we don't exceed Yahoo's limits
            const intradayRanges = {
                "1m": "1d",      // 1-min: max 7 days, use 1 day
                "5m": range,     // 5-min: max 60 days, use selected timeframe range
                "15m": range,    // 15-min: max 60 days
                "30m": range,    // 30-min: max 60 days
                "1h": range,     // 1-hour: max 730 days
                "1d": range,     // Daily: unlimited
            };
            // Keep the range from timeframe selection
        }

        // Fetch historical data
        let chartData = [];
        try {
            const url = `${API_URL}/market/history/${this.selectedSymbol}?interval=${interval}&range=${range}&_t=${Date.now()}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.data && data.data.length > 0) {
                chartData = data.data
                    .map((candle) => ({
                        time: candle.time,
                        open: parseFloat(candle.open),
                        high: parseFloat(candle.high),
                        low: parseFloat(candle.low),
                        close: parseFloat(candle.close),
                        value: parseFloat(candle.close), // For line/area charts
                        volume: candle.volume || 0,
                    }))
                    .filter(c => !isNaN(c.open) && !isNaN(c.close) && c.time)
                    .sort((a, b) => {
                        if (typeof a.time === 'number' && typeof b.time === 'number') {
                            return a.time - b.time;
                        }
                        return String(a.time).localeCompare(String(b.time));
                    });
            }
        } catch (err) {
            console.error("Failed to load chart data:", err);
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef5350;background:#131722;">Failed to load chart data</div>';
            return;
        }

        if (chartData.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#787b86;background:#131722;">No data available</div>';
            return;
        }

        // Clear container
        container.innerHTML = "";

        const firstPrice = chartData[0].close;
        const lastPrice = chartData[chartData.length - 1].close;
        const isPositive = lastPrice >= firstPrice;
        
        // TradingView Colors
        const colorGreen = "#26a69a";
        const colorRed = "#ef5350";
        const bgDark = "#131722"; // Standard TV dark background
        const gridColor = "#363c4e";
        const textColor = "#d1d4dc";

        this.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: 400,
            layout: {
                background: { type: "solid", color: bgDark },
                textColor: textColor,
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: "#2B2B43", style: 1 }, // Subtle grid
                horzLines: { color: "#2B2B43", style: 1 },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: "#758696",
                    width: 1,
                    style: 3,
                    labelBackgroundColor: "#4c525e",
                },
                horzLine: {
                    color: "#758696",
                    width: 1,
                    style: 3,
                    labelBackgroundColor: "#4c525e",
                },
            },
            rightPriceScale: {
                borderColor: "#2B2B43",
                scaleMargins: { top: 0.1, bottom: 0.2 },
                visible: true,
                borderVisible: false,
            },
            timeScale: {
                borderColor: "#2B2B43",
                timeVisible: true,
                secondsVisible: false,
                borderVisible: false,
                barSpacing: 10,
                minBarSpacing: 2,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
            handleScale: {
                axisPressedMouseMove: true,
                mouseWheel: true,
                pinch: true,
            },
        });

        // Main Series
        let mainSeries;
        if (this.chartType === "line") {
            mainSeries = this.chart.addSeries(LightweightCharts.AreaSeries, {
                lineColor: isPositive ? colorGreen : colorRed,
                topColor: isPositive ? "rgba(38, 166, 154, 0.4)" : "rgba(239, 83, 80, 0.4)",
                bottomColor: isPositive ? "rgba(38, 166, 154, 0.0)" : "rgba(239, 83, 80, 0.0)",
                lineWidth: 2,
                priceLineVisible: true,
                lastValueVisible: true,
            });
            mainSeries.setData(chartData.map(c => ({ time: c.time, value: c.close })));
        } else {
            mainSeries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
                upColor: colorGreen,
                downColor: colorRed,
                borderUpColor: colorGreen,
                borderDownColor: colorRed,
                wickUpColor: colorGreen,
                wickDownColor: colorRed,
            });
            mainSeries.setData(chartData);
        }

        // Volume Series
        const volumeSeries = this.chart.addSeries(LightweightCharts.HistogramSeries, {
            color: "#26a69a",
            priceFormat: { type: "volume" },
            priceScaleId: "volume", // separate scale
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        
        // Use a separate scale for volume so it sits at the bottom
        this.chart.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
            visible: false,
        });

        volumeSeries.setData(chartData.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
        })));

        // Smart Zoom: Force chart to show only the selected timeframe (e.g. 1D) 
        // while preserving the buffered history (e.g. 30D) for scrolling.
        const lastPoint = chartData[chartData.length - 1];
        if (lastPoint) {
            const isUnix = typeof lastPoint.time === 'number';
            
            // Duration in seconds
            const rangeDuration = {
                '1d': 86400,          // 1 Day
                '1w': 604800,         // 7 Days
                '1m': 2592000,        // 30 Days
                '3m': 7776000,        // 90 Days
                '1y': 31536000,       // 365 Days
            };
            
            const secondsNeeded = rangeDuration[this.chartTimeframe];
            
            if (secondsNeeded) {
                if (isUnix) {
                     const to = lastPoint.time;
                     const from = to - secondsNeeded;
                     this.chart.timeScale().setVisibleRange({ from, to });
                } else {
                     // String format 'YYYY-MM-DD'
                     // Convert to dates for math
                     const toDate = new Date(lastPoint.time);
                     const fromDate = new Date(toDate.getTime() - (secondsNeeded * 1000));
                     
                     // Format back to YYYY-MM-DD for lightweight-charts
                     const toStr = lastPoint.time; 
                     const fromStr = fromDate.toISOString().split('T')[0];
                     
                     this.chart.timeScale().setVisibleRange({ from: fromStr, to: toStr });
                }
            } else {
                this.chart.timeScale().fitContent();
            }
        } else {
             this.chart.timeScale().fitContent();
        }
        
        // Responsive Resize
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries.length === 0 || !this.chart) return;
            const { width } = entries[0].contentRect;
            if (width > 0) {
                this.chart.applyOptions({ width });
            }
        });
        resizeObserver.observe(container);
    }
};
