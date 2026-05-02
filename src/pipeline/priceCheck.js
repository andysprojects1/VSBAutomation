import { createId } from '../utils/ids.js';
import { createLogger } from '../utils/log.js';
import { extractListingFeatures } from './listingFeatures.js';
import { buildFingerprint } from './fingerprint.js';
import { generateQueries } from './queryGenerator.js';
import { scoreListingText } from './textMatcher.js';
import { decideMatch } from './visionMatcher.js';
import { priceFromMatches } from './pricing.js';

const log = createLogger('price-check');

export async function runPriceCheck({ store, ebayClient, visionService, config, input }) {
  const submission = await store.createSubmission(input);
  const vision = await safeVisionExtract(visionService, {
    images: input.images,
    note: input.rawNote,
    itemNameGuess: input.itemNameGuess
  });

  const fingerprint = buildFingerprint({
    submissionId: submission.id,
    note: input.rawNote,
    itemNameGuess: input.itemNameGuess,
    images: input.images,
    vision
  });
  await store.saveFingerprint(submission.id, fingerprint, config.vision.provider);

  const queries = generateQueries(fingerprint);
  await store.saveQueries(submission.id, queries);

  const storedListings = await store.findListingsForQueries(queries);
  const liveListings = await fetchLiveListings(ebayClient, queries);
  const deduped = dedupeListings([...storedListings, ...liveListings])
    .map((listing) => ({ ...listing, features: listing.features?.titleTokens ? listing.features : extractListingFeatures(listing) }));

  await store.upsertListings(deduped);

  const textRanked = deduped
    .map((listing) => {
      const textMatch = scoreListingText(fingerprint, listing, listing.features);
      return { listing, textMatch };
    })
    .sort((a, b) => b.textMatch.score - a.textMatch.score);

  const compared = [];
  for (const candidate of textRanked.slice(0, config.pipeline.maxVisionComparisons)) {
    const visionComparison = await safeVisionCompare(visionService, {
      userImages: input.images,
      listing: candidate.listing,
      fingerprint,
      textMatch: candidate.textMatch
    });
    compared.push({ ...candidate, visionComparison });
  }

  const rest = textRanked.slice(config.pipeline.maxVisionComparisons).map((candidate) => ({
    ...candidate,
    visionComparison: null
  }));

  const matches = [...compared, ...rest].map((candidate) => {
    const decision = decideMatch({
      textMatch: candidate.textMatch,
      visionComparison: candidate.visionComparison,
      features: candidate.listing.features,
      fingerprint
    });
    return {
      id: createId('mtc'),
      listingId: candidate.listing.id,
      listing: candidate.listing,
      textScore: candidate.textMatch.score,
      visionScore: decision.visionScore,
      finalLabel: decision.finalLabel,
      confidence: decision.confidence,
      needsReview: decision.needsReview,
      reasons: decision.reasons,
      scoreBreakdown: {
        text: candidate.textMatch.breakdown,
        vision: candidate.visionComparison
      }
    };
  });

  await store.saveListingMatches(submission.id, matches);

  const priceSnapshot = await store.savePriceSnapshot(
    submission.id,
    priceFromMatches(matches, config.pipeline.pricingVersion)
  );

  return {
    submission,
    fingerprint,
    queries,
    listings: deduped,
    matches,
    priceSnapshot
  };
}

async function safeVisionExtract(visionService, input) {
  try {
    return await visionService.extractShirt(input);
  } catch (error) {
    log.warn('Intake vision failed, continuing with heuristic fallback.', { error: error.message });
    return {
      notes: `Vision failed: ${error.message}`,
      confidence: {}
    };
  }
}

async function safeVisionCompare(visionService, input) {
  try {
    return await visionService.compareShirtToListing(input);
  } catch (error) {
    log.warn('Comparison vision failed for listing.', { listingId: input.listing.id, error: error.message });
    return null;
  }
}

async function fetchLiveListings(ebayClient, queries) {
  const listings = [];
  for (const query of queries.slice(0, 5)) {
    try {
      listings.push(...await ebayClient.searchSoldListings(query));
    } catch (error) {
      log.warn('eBay sold search failed.', { query: query.queryText, error: error.message });
      try {
        listings.push(...await ebayClient.searchActiveListings(query));
      } catch (fallbackError) {
        log.warn('eBay active fallback failed.', { query: query.queryText, error: fallbackError.message });
      }
    }
  }
  return listings;
}

function dedupeListings(listings) {
  const seen = new Set();
  const deduped = [];
  for (const listing of listings) {
    const key = `${listing.source}:${listing.externalSourceId || listing.url || listing.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(listing);
  }
  return deduped;
}
