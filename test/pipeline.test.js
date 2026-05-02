import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerprint } from '../src/pipeline/fingerprint.js';
import { generateQueries } from '../src/pipeline/queryGenerator.js';
import { extractListingFeatures } from '../src/pipeline/listingFeatures.js';
import { scoreListingText } from '../src/pipeline/textMatcher.js';
import { priceFromMatches } from '../src/pipeline/pricing.js';

test('fingerprint and queries include confident year and tag fields', () => {
  const fingerprint = buildFingerprint({
    submissionId: 'sub_test',
    note: '1996 Tupac All Eyez on Me shirt, giant tag, single stitch',
    itemNameGuess: 'Tupac All Eyez on Me',
    images: [{ role: 'front', url: 'x' }],
    vision: { confidence: {} }
  });
  const queries = generateQueries(fingerprint);
  assert.equal(fingerprint.visibleYear, '1996');
  assert.equal(fingerprint.tagBrand, 'giant');
  assert.ok(queries.some((query) => query.queryType === 'year_specific'));
  assert.ok(queries.some((query) => query.queryType === 'tag_specific'));
});

test('text matcher penalizes reprints', () => {
  const fingerprint = {
    artist: 'Tupac',
    queryName: 'Tupac 1996 vintage shirt',
    visibleYear: '1996',
    tagBrand: 'giant',
    hasBackHit: false
  };
  const listing = {
    title: 'Tupac 1996 modern reprint shirt',
    description: 'New tribute reprint',
    price: 25
  };
  const features = extractListingFeatures(listing);
  const score = scoreListingText(fingerprint, listing, features);
  assert.equal(features.likelyReprint, true);
  assert.ok(score.score < 50);
});

test('pricing uses weighted median and ignores rejected matches', () => {
  const snapshot = priceFromMatches([
    { finalLabel: 'exact_match', confidence: 0.9, listing: { id: 'a', price: 100, currency: 'USD', sold: true, soldDate: '2025-01-01' } },
    { finalLabel: 'exact_match', confidence: 0.9, listing: { id: 'b', price: 200, currency: 'USD', sold: true, soldDate: '2025-01-01' } },
    { finalLabel: 'reject', confidence: 0.9, listing: { id: 'c', price: 20, currency: 'USD', sold: true, soldDate: '2025-01-01' } }
  ]);
  assert.equal(snapshot.trustedCompCount, 2);
  assert.ok(snapshot.bestEstimate >= 100);
  assert.ok(snapshot.bestEstimate <= 200);
});
