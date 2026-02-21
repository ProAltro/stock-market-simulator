import { API_URL, get, post } from "../api.js";

// Global Monaco editor instance
let monacoEditor = null;

function getMonacoLanguage(lang) {
  return lang === "cpp" ? "cpp" : "python";
}

export const submissionsModule = {
  submissions: [],
  leaderboard: [],
  dataInfo: null,
  selectedLanguage: "python",
  code: "",
  submitting: false,
  submissionResult: null,
  codeTemplates: {
    python: `# Commodity Trading Algorithm
# Available functions:
# - get_commodities() -> ['OIL', 'STEEL', 'WOOD', 'BRICK', 'GRAIN']
# - get_tick_count() -> 1000000
# - get_current_tick() -> current tick number
# - get_ohlcv(symbol, start=None, end=None) -> [{tick, open, high, low, close, volume}]
# - get_orderbook(symbol, tick) -> {bids: [{price, qty}], asks: [{price, qty}]}
# - get_news(tick) -> [{symbol, category, sentiment, magnitude, headline}]
# - get_cash() -> current cash balance
# - get_positions() -> {symbol: quantity}
# - get_position(symbol) -> quantity
# - get_price(symbol, tick=None) -> price
# - buy(symbol, quantity) -> bool
# - sell(symbol, quantity) -> bool

# Simple example: Buy OIL when price drops, sell when it rises
def run():
    symbol = 'OIL'
    entry_price = None
    
    for tick in range(get_tick_count()):
        price = get_price(symbol, tick)
        
        if entry_price is None:
            # Start by buying
            if get_cash() > price * 10:
                buy(symbol, 10)
                entry_price = price
        else:
            # Sell if price rose 5% or fell 10%
            change = (price - entry_price) / entry_price
            if change > 0.05 or change < -0.10:
                sell(symbol, get_position(symbol))
                entry_price = None

run()
`,
    cpp: `// Commodity Trading Algorithm (C++)
// Functions: get_commodities(), get_tick_count(), get_current_tick(),
// get_price(symbol, tick), get_cash(), get_position(symbol),
// buy(symbol, quantity), sell(symbol, quantity)

#include <iostream>
#include <vector>
#include <string>

int main() {
    std::string symbol = "OIL";
    double entry_price = 0;
    
    for (int tick = 0; tick < get_tick_count(); tick++) {
        double price = get_price(symbol, tick);
        
        if (entry_price == 0) {
            if (get_cash() > price * 10) {
                buy(symbol, 10);
                entry_price = price;
            }
        } else {
            double change = (price - entry_price) / entry_price;
            if (change > 0.05 || change < -0.10) {
                sell(symbol, get_position(symbol));
                entry_price = 0;
            }
        }
    }
    
    return 0;
}
`,
  },

  async fetchSubmissions() {
    if (!this.user) return;
    try {
      this.submissions = await get(`${API_URL}/submissions`);
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
    }
  },

  async fetchLeaderboard() {
    try {
      this.leaderboard = await get(`${API_URL}/submissions/leaderboard`);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    }
  },

  async fetchDataInfo() {
    try {
      this.dataInfo = await get(`${API_URL}/data/info`);
    } catch (err) {
      console.error("Failed to fetch data info:", err);
    }
  },

  async submitAlgorithm() {
    if (!this.user) {
      this.showAuthModal = true;
      return;
    }

    this.submitting = true;
    this.submissionResult = null;

    try {
      const result = await post(`${API_URL}/submissions`, {
        code: this.code,
        language: this.selectedLanguage,
      });

      this.submissionResult = result;
      await this.fetchSubmissions();

      // Poll for result
      this.pollSubmission(result.id);
    } catch (err) {
      this.submissionResult = { status: "failed", error: err.message };
    } finally {
      this.submitting = false;
    }
  },

  async pollSubmission(id) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const result = await get(`${API_URL}/submissions/${id}`);
        if (result.status === "completed" || result.status === "failed") {
          this.submissionResult = result;
          await this.fetchLeaderboard();
          return;
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }
    this.submissionResult = { error: "Timeout waiting for result" };
  },

  selectTemplate(lang) {
    this.selectedLanguage = lang;
    this.code = this.codeTemplates[lang];
    if (monacoEditor) {
      monaco.editor.setModelLanguage(
        monacoEditor.getModel(),
        getMonacoLanguage(lang),
      );
      monacoEditor.setValue(this.code);
    }
  },

  initMonacoEditor() {
    const container = document.getElementById("monaco-editor-container");
    if (!container || monacoEditor) return;

    if (typeof monaco === "undefined") {
      console.warn("Monaco not loaded yet, retrying...");
      setTimeout(() => this.initMonacoEditor(), 200);
      return;
    }

    monacoEditor = monaco.editor.create(container, {
      value: this.code || this.codeTemplates[this.selectedLanguage],
      language: getMonacoLanguage(this.selectedLanguage),
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      lineNumbers: "on",
      renderLineHighlight: "line",
      tabSize: 4,
      padding: { top: 12, bottom: 12 },
      wordWrap: "on",
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
    });

    // Sync Monaco content back to Alpine's code property
    monacoEditor.onDidChangeModelContent(() => {
      this.code = monacoEditor.getValue();
    });

    // Set initial code if empty
    if (!this.code) {
      this.code = this.codeTemplates[this.selectedLanguage];
      monacoEditor.setValue(this.code);
    }
  },

  async downloadData() {
    try {
      const response = await fetch(`${API_URL}/data/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "commodity_data_100k.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  },
};
