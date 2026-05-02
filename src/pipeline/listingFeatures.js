import { extractYears, includesAny, normalizeText } from './text.js';

const TAG_BRANDS = [
  'anvil', 'brockum', 'changes', 'fruit of the loom', 'giant', 'hanes', 'jerzees',
  'liquid blue', 'screen stars', 'spring ford', 'stanley desantis', 'tultex', 'wild oats'
];

const SIZE_TERMS = ['small', 'medium', 'large', 'xl', 'xxl', '2xl', '3xl'];
const REPRINT_TERMS = ['reprint', 'retro', 'modern', 'tribute', 'reproduction', 'new print'];
const BOOTLEG_TERMS = ['bootleg', 'parking lot', 'lot shirt'];
const BACK_HIT_TERMS = ['back hit', 'double sided', 'two sided', '2 sided', 'front back', 'back print'];
const SINGLE_STITCH_TERMS = ['single stitch', 'single-stitch', 'single stitched'];
const DOUBLE_STITCH_TERMS = ['double stitch', 'double-stitch', 'double stitched'];
const CONDITION_TERMS = ['faded', 'thin', 'holes', 'stain', 'stains', 'cracking', 'distressed', 'dry rot'];

export function extractListingFeatures(listing) {
  const haystack = `${listing.title ?? ''} ${listing.description ?? ''}`;
  const normalized = normalizeText(haystack);
  const years = extractYears(haystack);
  const tagBrand = TAG_BRANDS.find((brand) => normalized.includes(normalizeText(brand))) ?? null;
  const size = SIZE_TERMS.find((term) => normalized.includes(term)) ?? null;
  const stitchType = includesAny(haystack, SINGLE_STITCH_TERMS)
    ? 'single stitch'
    : includesAny(haystack, DOUBLE_STITCH_TERMS)
      ? 'double stitch'
      : null;

  return {
    years,
    visibleYear: years[0] ?? null,
    tagBrand,
    stitchType,
    size,
    hasBackHit: includesAny(haystack, BACK_HIT_TERMS),
    likelyReprint: hasPositiveTerm(haystack, REPRINT_TERMS),
    likelyBootleg: includesAny(haystack, BOOTLEG_TERMS),
    conditionFlags: CONDITION_TERMS.filter((term) => normalized.includes(term)),
    titleTokens: normalized.split(' ').filter(Boolean).slice(0, 40)
  };
}

function hasPositiveTerm(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => {
    const needle = normalizeText(term);
    const index = normalized.indexOf(needle);
    if (index === -1) return false;
    const before = normalized.slice(Math.max(0, index - 18), index).trim();
    if (/\b(no|not|never|without)$/.test(before)) return false;
    return true;
  });
}
