export const CURRENCIES: Record<string, { symbol: string; locale: string }> = {
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
  NGN: { symbol: "₦", locale: "en-NG" },
  KES: { symbol: "KSh", locale: "en-KE" },
  GHS: { symbol: "₵", locale: "en-GH" },
  ZAR: { symbol: "R", locale: "en-ZA" },
  INR: { symbol: "₹", locale: "en-IN" },
  CAD: { symbol: "C$", locale: "en-CA" },
  AUD: { symbol: "A$", locale: "en-AU" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

export function formatCurrency(amount: number | null | undefined, currency: string = "USD"): string {
  const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  const meta = CURRENCIES[currency] || CURRENCIES.USD;
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${meta.symbol}${value.toFixed(2)}`;
  }
}

export function currencySymbol(currency: string = "USD"): string {
  return (CURRENCIES[currency] || CURRENCIES.USD).symbol;
}