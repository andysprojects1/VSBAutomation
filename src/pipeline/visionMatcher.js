export function decideMatch({ textMatch, visionComparison, features, fingerprint }) {
  const visionScore = visionComparison?.visualSimilarityScore ?? null;
  const combined = visionScore == null
    ? textMatch.score
    : (textMatch.score * 0.65) + (visionScore * 0.35);
  const reasons = [...textMatch.reasons, ...(visionComparison?.keyDifferences ?? [])];

  let finalLabel = 'reject';
  if (features.likelyReprint) {
    finalLabel = 'likely_reprint';
    reasons.push('excluded because listing appears to be a reprint');
  } else if (fingerprint.hasBackHit && visionComparison?.sameBackHitLayout === false) {
    finalLabel = 'wrong_back_hit';
    reasons.push('visual comparison says back hit differs');
  } else if (combined >= 72 && textMatch.preliminaryLabel === 'accepted') {
    finalLabel = 'exact_match';
  } else if (combined >= 48) {
    finalLabel = 'same_family_different_variant';
  } else if (combined >= 38) {
    finalLabel = 'uncertain';
  }

  return {
    finalLabel,
    confidence: Math.round(Math.max(0, Math.min(100, combined))) / 100,
    needsReview: ['uncertain', 'same_family_different_variant', 'wrong_back_hit', 'likely_reprint'].includes(finalLabel),
    reasons,
    visionScore
  };
}
