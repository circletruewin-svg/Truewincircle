export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatAmount(value) {
  return roundMoney(value).toFixed(2);
}

export function formatCurrency(value, symbol = "₹") {
  return `${symbol}${formatAmount(value)}`;
}
