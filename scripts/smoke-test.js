import { getConfig } from '../src/config.js';
import { JsonStore } from '../src/storage/jsonStore.js';
import { VisionService } from '../src/integrations/vision.js';
import { runPriceCheck } from '../src/pipeline/priceCheck.js';
import { extractListingFeatures } from '../src/pipeline/listingFeatures.js';

const config = getConfig();
config.storage.driver = 'json';
config.storage.jsonPath = 'data/smoke-store.json';
config.vision.provider = 'heuristic';

const store = new JsonStore(config.storage.jsonPath);
await store.init();

const sampleListings = [
  {
    id: 'lst_seed_1',
    source: 'manual',
    externalSourceId: 'seed-1',
    url: 'https://example.com/sold-1',
    title: '1994 Nine Inch Nails Downward Spiral vintage shirt single stitch',
    description: 'Original vintage tee, faded, single stitch, no reprint.',
    price: 260,
    currency: 'USD',
    sold: true,
    soldDate: '2025-10-01T00:00:00.000Z',
    imageUrls: [],
    rawPayload: {}
  },
  {
    id: 'lst_seed_2',
    source: 'manual',
    externalSourceId: 'seed-2',
    url: 'https://example.com/sold-2',
    title: 'Nine Inch Nails 1994 vintage tee double sided',
    description: 'Brockum tag. Back print. Used condition.',
    price: 310,
    currency: 'USD',
    sold: true,
    soldDate: '2025-08-12T00:00:00.000Z',
    imageUrls: [],
    rawPayload: {}
  },
  {
    id: 'lst_seed_3',
    source: 'manual',
    externalSourceId: 'seed-3',
    url: 'https://example.com/reprint',
    title: 'Nine Inch Nails modern reprint shirt',
    description: 'Modern tribute reprint.',
    price: 28,
    currency: 'USD',
    sold: true,
    soldDate: '2025-12-01T00:00:00.000Z',
    imageUrls: [],
    rawPayload: {}
  }
].map((listing) => ({ ...listing, features: extractListingFeatures(listing) }));

await store.upsertListings(sampleListings);

const ebayClient = {
  async searchSoldListings() {
    return [];
  },
  async searchActiveListings() {
    return [];
  }
};

const result = await runPriceCheck({
  store,
  ebayClient,
  visionService: new VisionService(config.vision),
  config,
  input: {
    discordUserId: 'smoke-user',
    guildId: 'smoke-guild',
    channelId: 'smoke-channel',
    rawNote: '1994 Nine Inch Nails Downward Spiral, single stitch, faded, back hit',
    itemNameGuess: 'Nine Inch Nails 1994 Downward Spiral',
    images: [
      { role: 'front', url: 'https://example.com/front.jpg', filename: 'nin-front.jpg', contentType: 'image/jpeg' },
      { role: 'back', url: 'https://example.com/back.jpg', filename: 'nin-back.jpg', contentType: 'image/jpeg' }
    ]
  }
});

console.log(JSON.stringify({
  submissionId: result.submission.id,
  estimate: result.priceSnapshot.bestEstimate,
  range: [result.priceSnapshot.lowRange, result.priceSnapshot.highRange],
  confidence: result.priceSnapshot.confidence,
  trustedCompCount: result.priceSnapshot.trustedCompCount
}, null, 2));
