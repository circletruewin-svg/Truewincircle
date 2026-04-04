export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatAmount(value) {
  return roundMoney(value).toFixed(2);
}

export function formatCurrency(value, symbol = "\u20B9") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}
