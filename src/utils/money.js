export function parseMoney(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && value.value != null) return parseMoney(value.value);
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(value));
}
