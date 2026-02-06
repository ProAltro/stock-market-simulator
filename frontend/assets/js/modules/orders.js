import { API_URL, fetchWithAuth, post } from "../api.js";

export const ordersModule = {
  orders: [],
  orderForm: {
    side: "BUY",
    quantity: 1,
    orderType: "MARKET",
    limitPrice: null,
  },
  orderError: "",
  orderSuccess: "",
  orderLoading: false,

  async fetchOrders() {
    try {
      const res = await fetchWithAuth(`${API_URL}/orders/history`);
      this.orders = await res.json();
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    }
  },

  async placeOrder() {
    this.orderError = "";
    this.orderSuccess = "";
    this.orderLoading = true;

    try {
      const res = await post(`${API_URL}/orders`, {
        symbol: this.selectedSymbol,
        side: this.orderForm.side,
        quantity: Number(this.orderForm.quantity),
        orderType: this.orderForm.orderType,
        limitPrice:
          this.orderForm.orderType === "LIMIT"
            ? Number(this.orderForm.limitPrice)
            : undefined,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      this.orderSuccess = `Order executed at ${this.formatCurrency(data.executionPrice, data.currency)}`;

      // Refresh data
      await Promise.all([this.fetchPortfolio(), this.fetchOrders()]);

      // Clear success message after 3 seconds
      setTimeout(() => {
        this.orderSuccess = "";
      }, 3000);
    } catch (err) {
      this.orderError = err.message;
    } finally {
      this.orderLoading = false;
    }
  },
};
