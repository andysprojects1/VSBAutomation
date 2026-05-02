const EXACT_LABELS = new Set(['exact_match', 'same_family_different_variant']);

function daysSince(dateValue) {
  if (!dateValue) return 730;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 730;
  return Math.max(0, (Date.now() - date.getTime()) / 86400000);
}

function recencyWeight(dateValue) {
  const days = daysSince(dateValue);
  return Math.max(0.35, Math.exp(-days / 730));
}

function weightedMedian(items) {
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;
  for (const item of sorted) {
    running += item.weight;
    if (running >= totalWeight / 2) return item.price;
  }
  return sorted.at(-1)?.price ?? null;
}

function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * pct)));
  return sorted[index];
}

export function priceFromMatches(matches, pricingVersion = 'weighted-median-v1') {
  const usable = matches
    .filter((match) => EXACT_LABELS.has(match.finalLabel))
    .filter((match) => match.listing?.sold !== false)
    .filter((match) => Number.isFinite(Number(match.listing?.price)))
    .map((match) => {
      const price = Number(match.listing.price);
      const labelWeight = match.finalLabel === 'exact_match' ? 1 : 0.72;
      const confidenceWeight = Math.max(0.25, Number(match.confidence ?? 0.4));
      const recent = recencyWeight(match.listing.soldDate ?? match.listing.sold_date);
      return {
        match,
        price,
        weight: labelWeight * confidenceWeight * recent
      };
    });

  if (!usable.length) {
    return {
      id: null,
      bestEstimate: null,
      lowRange: null,
      highRange: null,
      currency: 'USD',
      confidence: 'low',
      trustedCompCount: 0,
      notes: ['No trusted sold comps survived filtering.'],
      compIdsUsed: [],
      pricingVersion
    };
  }

  const values = usable.map((item) => item.price);
  const estimate = weightedMedian(usable);
  const low = percentile(values, usable.length >= 4 ? 0.15 : 0);
  const high = percentile(values, usable.length >= 4 ? 0.85 : 1);
  const exactCount = usable.filter((item) => item.match.finalLabel === 'exact_match').length;
  const confidence = exactCount >= 5 ? 'high' : exactCount >= 2 || usable.length >= 4 ? 'medium' : 'low';
  const currency = usable.find((item) => item.match.listing.currency)?.match.listing.currency ?? 'USD';
  const notes = [
    `Weighted median from ${usable.length} trusted sold comp${usable.length === 1 ? '' : 's'}.`,
    confidence === 'low' ? 'Limited comp count or weaker match confidence.' : 'Recent and closer matches were weighted higher.'
  ];

  return {
    id: null,
    bestEstimate: Math.round(estimate),
    lowRange: Math.round(low),
    highRange: Math.round(high),
    currency,
    confidence,
    trustedCompCount: usable.length,
    notes,
    compIdsUsed: usable.map((item) => item.match.listing.id),
    pricingVersion
  };
}
