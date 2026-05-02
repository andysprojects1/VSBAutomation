import { tokenSimilarity, normalizeText } from './text.js';

function hasNeedle(value, needle) {
  if (!value || !needle) return false;
  return normalizeText(value).includes(normalizeText(needle));
}

export function scoreListingText(fingerprint, listing, features) {
  const haystack = `${listing.title ?? ''} ${listing.description ?? ''}`;
  const breakdown = {};
  let score = 0;
  const reasons = [];

  if (fingerprint.artist) {
    breakdown.artistExact = hasNeedle(haystack, fingerprint.artist) ? 28 : 0;
    breakdown.artistFuzzy = breakdown.artistExact ? 0 : Math.round(tokenSimilarity(fingerprint.artist, haystack) * 32);
    score += breakdown.artistExact + breakdown.artistFuzzy;
    if (breakdown.artistExact) reasons.push('artist exact match');
    if (breakdown.artistFuzzy >= 10) reasons.push('artist fuzzy match');
  }

  const titleSimilarity = tokenSimilarity(fingerprint.queryName || fingerprint.graphicFamilyGuess || fingerprint.artist, listing.title);
  breakdown.titleSimilarity = Math.round(titleSimilarity * 25);
  score += breakdown.titleSimilarity;
  if (titleSimilarity > 0.35) reasons.push('title shares important tokens');

  if (fingerprint.visibleYear) {
    breakdown.year = features.years?.includes(String(fingerprint.visibleYear)) ? 14 : 0;
    score += breakdown.year;
    if (breakdown.year) reasons.push('year match');
  }

  if (fingerprint.tourOrAlbum) {
    breakdown.tourAlbum = hasNeedle(haystack, fingerprint.tourOrAlbum) ? 12 : 0;
    score += breakdown.tourAlbum;
    if (breakdown.tourAlbum) reasons.push('tour/album match');
  }

  if (fingerprint.tagBrand) {
    breakdown.tag = normalizeText(features.tagBrand) === normalizeText(fingerprint.tagBrand) || hasNeedle(haystack, fingerprint.tagBrand) ? 8 : 0;
    score += breakdown.tag;
    if (breakdown.tag) reasons.push('tag match');
  }

  if (fingerprint.stitchType) {
    breakdown.stitch = features.stitchType === fingerprint.stitchType ? 6 : 0;
    score += breakdown.stitch;
    if (breakdown.stitch) reasons.push('stitch match');
  }

  if (fingerprint.hasBackHit) {
    breakdown.backHit = features.hasBackHit ? 5 : -4;
    score += breakdown.backHit;
    reasons.push(features.hasBackHit ? 'back hit mentioned' : 'back hit not mentioned');
  }

  breakdown.reprintPenalty = features.likelyReprint ? -30 : 0;
  breakdown.modernPenalty = features.likelyReprint ? -15 : 0;
  breakdown.bootlegPenalty = features.likelyBootleg ? -8 : 0;
  score += breakdown.reprintPenalty + breakdown.modernPenalty + breakdown.bootlegPenalty;

  if (features.likelyReprint) reasons.push('listing mentions reprint or modern wording');
  if (features.likelyBootleg) reasons.push('listing mentions bootleg wording');

  const clamped = Math.max(0, Math.min(100, score));
  const preliminaryLabel = clamped >= 68 ? 'accepted' : clamped >= 42 ? 'uncertain' : 'rejected';

  return {
    score: clamped,
    preliminaryLabel,
    reasons,
    breakdown
  };
}
