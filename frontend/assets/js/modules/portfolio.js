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
    if (
      !this.portfolio ||
      !this.portfolio.positions ||
      this.portfolio.positions.length === 0
    )
      return;

    console.log("Refreshing portfolio prices...");
    let totalPositionsValue = 0;
    let totalPositionsValueBase = 0;

    // Fetch latest quotes for all positions
    const pricePromises = this.portfolio.positions.map(async (pos) => {
      try {
        const symbol = pos.instrument?.symbol || pos.symbol;
        if (!symbol) return pos;

        const quoteRes = await fetch(`${API_URL}/market/quote/${symbol}`);
        if (!quoteRes.ok) return pos;

        const quote = await quoteRes.json();
        const currentPrice = quote.price;
        const quoteCurrency = (
          quote.currency ||
          pos.currency ||
          "USD"
        ).toUpperCase();

        // Native currency calculations
        const marketValue = pos.quantity * currentPrice;
        const costBasis = pos.quantity * pos.avgPrice;
        const unrealizedPnL = marketValue - costBasis;
        const unrealizedPnLPercent =
          costBasis !== 0 ? (unrealizedPnL / costBasis) * 100 : 0;

        // Base currency calculations (use existing exchange rate from backend as approximation)
        const rate = pos.exchangeRate || 1;
        const currentPriceBase = currentPrice * rate;
        const avgPriceBase = pos.avgPriceBase || pos.avgPrice * rate;
        const marketValueBase = pos.quantity * currentPriceBase;
        const costBasisBase = pos.quantity * avgPriceBase;
        const unrealizedPnLBase = marketValueBase - costBasisBase;

        totalPositionsValue += marketValue;
        totalPositionsValueBase += marketValueBase;

        return {
          ...pos,
          currency: quoteCurrency,
          currentPrice,
          currentPriceBase,
          marketValue,
          marketValueBase,
          costBasis,
          costBasisBase,
          avgPriceBase,
          unrealizedPnL,
          unrealizedPnLBase,
          unrealizedPnLPercent,
          _updated: true,
        };
      } catch (err) {
        console.error(`Failed to update price for ${pos.symbol}:`, err);
        totalPositionsValue += pos.marketValue || 0;
        totalPositionsValueBase += pos.marketValueBase || 0;
        return pos;
      }
    });

    const updatedPositions = await Promise.all(pricePromises);

    const cashBalance = this.portfolio.cashBalance;
    const totalValue = cashBalance + totalPositionsValueBase; // cash is already in base currency
    const derivedStartingBalance =
      this.portfolio.totalValue - this.portfolio.totalReturn;
    const newTotalReturn = totalValue - derivedStartingBalance;
    const newTotalReturnPercent =
      derivedStartingBalance !== 0
        ? (newTotalReturn / derivedStartingBalance) * 100
        : 0;

    this.portfolio = {
      ...this.portfolio,
      positions: updatedPositions,
      positionsValue: totalPositionsValueBase,
      totalValue: totalValue,
      totalReturn: newTotalReturn,
      totalReturnPercent: newTotalReturnPercent,
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
        body: JSON.stringify(settings),
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
      const res = await post(`${API_URL}/profile/add-funds`, {
        amount: Number(this.addFundsAmount),
      });
      const data = await res.json();
      if (res.ok) {
        this.settingsMessage = `Added ${formatCurrency(this.addFundsAmount, this.profile?.currency || "USD")}`;
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
    if (!confirm("Are you sure? This will delete all positions and orders."))
      return;
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
    if (!confirm(`Switch to ${mode} mode? This will reset your account.`))
      return;
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
