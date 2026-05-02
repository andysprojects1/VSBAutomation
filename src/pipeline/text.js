const STOP_WORDS = new Set([
  'a', 'an', 'and', 'authentic', 'black', 'blue', 'brown', 'deadstock', 'for', 'from',
  'gray', 'grey', 'large', 'medium', 'mens', 'new', 'of', 'official', 'on', 'original',
  'rare', 'shirt', 'small', 'tee', 't-shirt', 'the', 'true', 'used', 'vintage', 'white',
  'xl', 'xxl'
]);

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}

export function tokenSimilarity(left, right) {
  const a = new Set(uniqueTokens(left));
  const b = new Set(uniqueTokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.max(a.size, b.size);
}

export function includesAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

export function extractYears(text) {
  const matches = String(text ?? '').match(/\b(19[6-9][0-9]|20[0-2][0-9])\b/g) ?? [];
  return [...new Set(matches)];
}
