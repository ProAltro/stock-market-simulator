import { API_URL, fetchWithAuth, post } from "../api.js";
import { formatCurrency } from "../utils.js";

export const portfolioModule = {
    portfolio: null,
    leaderboard: [],
    myRank: null,
    profile: null,
    addFundsAmount: 10000,
    settingsMessage: "",

    async fetchPortfolio() {
        try {
            const res = await fetchWithAuth(`${API_URL}/portfolio`);
            const portfolioData = await res.json();
            
            // Initial load with backend data
            this.portfolio = portfolioData;

            // Now update with real-time prices
            if (this.portfolio && this.portfolio.positions) {
                await this.refreshPortfolioPrices();
            }
        } catch (err) {
            console.error("Failed to fetch portfolio:", err);
        }
    },

    async refreshPortfolioPrices() {
        if (!this.portfolio || !this.portfolio.positions || this.portfolio.positions.length === 0) return;

        console.log("Refreshing portfolio prices...");
        let totalPositionsValue = 0;
        let totalCostBasis = 0;

        // Fetch latest quotes for all positions
        const pricePromises = this.portfolio.positions.map(async (pos) => {
            try {
                // Determine symbol (handle different backend structures just in case)
                const symbol = pos.instrument?.symbol || pos.symbol;
                if (!symbol) return pos;

                // Fetch quote from market API
                const quoteRes = await fetch(`${API_URL}/market/quote/${symbol}`);
                if (!quoteRes.ok) return pos;
                
                const quote = await quoteRes.json();
                const currentPrice = quote.price;

                // Update position calculations
                const marketValue = pos.quantity * currentPrice;
                const unrealizedPnL = marketValue - pos.costBasis; // Assuming costBasis is correct from backend, or: pos.quantity * pos.avgPrice
                
                // Recalculate cost basis just to be safe
                const costBasis = pos.quantity * pos.avgPrice;
                const unrealizedPnLPercent = costBasis !== 0 ? (unrealizedPnL / costBasis) * 100 : 0;

                return {
                    ...pos,
                    currentPrice: currentPrice,
                    marketValue: marketValue,
                    unrealizedPnL: unrealizedPnL,
                    unrealizedPnLPercent: unrealizedPnLPercent,
                    _updated: true
                };
            } catch (err) {
                console.error(`Failed to update price for ${pos.symbol}:`, err);
                return pos;
            }
        });

        const updatedPositions = await Promise.all(pricePromises);

        // Recalculate portfolio totals
        updatedPositions.forEach(pos => {
            totalPositionsValue += pos.marketValue;
            totalCostBasis += (pos.quantity * pos.avgPrice);
        });

        const cashBalance = this.portfolio.cashBalance;
        const totalValue = cashBalance + totalPositionsValue;
        const totalReturn = totalValue - 100000; // Assuming 100k start, ideally we get this from backend
        // Better: use the diff from current totalValue vs (totalValue - rawPnL)? 
        // Or just trust the backend provided 'startingBalance' implication.
        // Let's stick to updating the return based on the NEW totalValue.
        
        // Use the previous totalReturn to infer starting balance if needed, or just hardcode 100k for now as per app logic
        // But better is: Total Return = Total Value - Starting Balance.
        // Starting Balance = (Old Total Value - Old Total Return).
        const derivedStartingBalance = this.portfolio.totalValue - this.portfolio.totalReturn;
        
        const newTotalReturn = totalValue - derivedStartingBalance;
        const newTotalReturnPercent = derivedStartingBalance !== 0 ? (newTotalReturn / derivedStartingBalance) * 100 : 0;

        // Apply updates
        this.portfolio = {
            ...this.portfolio,
            positions: updatedPositions,
            positionsValue: totalPositionsValue,
            totalValue: totalValue,
            totalReturn: newTotalReturn,
            totalReturnPercent: newTotalReturnPercent
        };
    },

    async fetchLeaderboard() {
        try {
            const res = await fetch(`${API_URL}/leaderboard`);
            this.leaderboard = await res.json();

            // Get user's rank
            if (this.token) {
                const rankRes = await fetchWithAuth(`${API_URL}/leaderboard/me`);
                if (rankRes.ok) {
                    this.myRank = await rankRes.json();
                }
            }
        } catch (err) {
            console.error("Failed to fetch leaderboard:", err);
        }
    },

    async fetchProfile() {
        try {
            const res = await fetchWithAuth(`${API_URL}/profile`);
            this.profile = await res.json();
        } catch (err) {
            console.error("Failed to fetch profile:", err);
        }
    },

    async updateSettings(settings) {
        this.settingsMessage = "";
        try {
            const res = await fetchWithAuth(`${API_URL}/profile`, {
                method: "PATCH",
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (res.ok) {
                this.settingsMessage = "Settings saved";
                await this.fetchProfile();
            } else {
                this.settingsMessage = data.error || "Failed to save";
            }
        } catch (err) {
            this.settingsMessage = "Error saving settings";
        }
    },

    async addFunds() {
        this.settingsMessage = "";
        try {
            const res = await post(`${API_URL}/profile/add-funds`, { amount: Number(this.addFundsAmount) });
            const data = await res.json();
            if (res.ok) {
                this.settingsMessage = `Added ${formatCurrency(this.addFundsAmount)}`;
                await this.fetchPortfolio();
                await this.fetchProfile();
            } else {
                this.settingsMessage = data.error || "Failed to add funds";
            }
        } catch (err) {
            this.settingsMessage = "Error adding funds";
        }
    },

    async resetAccount() {
        if (!confirm("Are you sure? This will delete all positions and orders.")) return;
        this.settingsMessage = "";
        try {
            const res = await post(`${API_URL}/profile/reset-account`, {});
            const data = await res.json();
            if (res.ok) {
                this.settingsMessage = "Account reset successfully";
                await this.fetchPortfolio();
                await this.fetchProfile();
            } else {
                this.settingsMessage = data.error || "Failed to reset";
            }
        } catch (err) {
            this.settingsMessage = "Error resetting account";
        }
    },

    async switchMode(mode) {
        if (!confirm(`Switch to ${mode} mode? This will reset your account.`)) return;
        this.settingsMessage = "";
        try {
            const res = await post(`${API_URL}/profile/switch-mode`, { mode });
            const data = await res.json();
            if (res.ok) {
                this.settingsMessage = data.message;
                await this.fetchPortfolio();
                await this.fetchProfile();
            } else {
                this.settingsMessage = data.error || "Failed to switch mode";
            }
        } catch (err) {
            this.settingsMessage = "Error switching mode";
        }
    },
};
