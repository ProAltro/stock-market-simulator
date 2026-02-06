const CURRENCY_LOCALE_MAP = {
  USD: "en-US",
  INR: "en-IN",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CAD: "en-CA",
  AUD: "en-AU",
  CHF: "de-CH",
  CNY: "zh-CN",
  SGD: "en-SG",
  HKD: "zh-HK",
};

function getLocale(currency) {
  return CURRENCY_LOCALE_MAP[currency] || "en-US";
}

export function formatCurrency(value, currency = "USD") {
  if (value === null || value === undefined)
    return new Intl.NumberFormat(getLocale(currency), {
      style: "currency",
      currency,
    }).format(0);

  try {
    const locale = getLocale(currency || "USD");
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(value);
  } catch (e) {
    // Fallback if currency code is invalid
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }
}

export function formatPercent(value) {
  if (value === null || value === undefined) return "0.00%";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
