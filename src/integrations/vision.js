import { extractYears, includesAny, normalizeText } from '../pipeline/text.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('vision');

const INTAKE_SCHEMA_HINT = {
  likelyArtist: 'string|null',
  brandOrSubject: 'string|null',
  graphicSummary: 'string|null',
  tourOrAlbum: 'string|null',
  eraGuess: 'string|null',
  decadeGuess: 'string|null',
  visibleYear: 'string|null',
  tagBrand: 'string|null',
  stitchType: 'single stitch|double stitch|null',
  hasBackHit: 'boolean|null',
  conditionFlags: ['string'],
  authenticityFlags: ['string'],
  graphicFamilyGuess: 'string|null',
  confidence: {
    artist: '0-1',
    visibleYear: '0-1',
    tagBrand: '0-1',
    stitchType: '0-1',
    graphicFamily: '0-1'
  },
  notes: 'string'
};

export class VisionService {
  constructor(config) {
    this.config = config;
  }

  async extractShirt({ images, note, itemNameGuess }) {
    if (this.config.provider === 'openai' && this.config.openAiApiKey) {
      return this.extractWithOpenAI({ images, note, itemNameGuess });
    }
    if (this.config.provider === 'webhook' && this.config.webhookUrl) {
      return this.callWebhook('/extract', { images, note, itemNameGuess, schema: INTAKE_SCHEMA_HINT });
    }
    return heuristicExtract({ images, note, itemNameGuess });
  }

  async compareShirtToListing({ userImages, listing, fingerprint, textMatch }) {
    if (this.config.provider === 'openai' && this.config.openAiApiKey && listing.imageUrls?.length) {
      return this.compareWithOpenAI({ userImages, listing, fingerprint, textMatch });
    }
    if (this.config.provider === 'webhook' && this.config.webhookUrl) {
      return this.callWebhook('/compare', { userImages, listing, fingerprint, textMatch });
    }
    return heuristicCompare({ listing, fingerprint, textMatch });
  }

  async callWebhook(path, payload) {
    const response = await fetch(`${this.config.webhookUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.webhookToken ? { Authorization: `Bearer ${this.config.webhookToken}` } : {})
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Vision webhook failed (${response.status})`);
    }
    return response.json();
  }

  async extractWithOpenAI({ images, note, itemNameGuess }) {
    const content = [
      {
        type: 'input_text',
        text: [
          'Extract a structured vintage t-shirt fingerprint from these Discord submission inputs.',
          'Return only valid JSON matching this schema:',
          JSON.stringify(INTAKE_SCHEMA_HINT),
          'Do not produce a final price or final authenticity decision.',
          `User note: ${note || ''}`,
          `Item name guess: ${itemNameGuess || ''}`
        ].join('\n')
      },
      ...images.map((image) => ({
        type: 'input_image',
        image_url: image.url,
        detail: image.role === 'tag' ? 'high' : 'auto'
      }))
    ];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openAiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.openAiModel,
        input: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI intake vision failed (${response.status}): ${text.slice(0, 300)}`);
    }
    const data = await response.json();
    return parseJsonOutput(data);
  }

  async compareWithOpenAI({ userImages, listing, fingerprint, textMatch }) {
    const content = [
      {
        type: 'input_text',
        text: [
          'Compare a user vintage t-shirt submission to a candidate sold listing.',
          'Return only valid JSON with fields: visualSimilarityScore 0-100, sameFrontGraphicFamily boolean|null, sameBackHitLayout boolean|null, sameTagFamily boolean|null, sameLikelyVariant boolean|null, classification exact_match|same_family_different_variant|reject|unclear|likely_reprint, keyDifferences string[], confidence 0-1, notes string.',
          `Fingerprint: ${JSON.stringify(fingerprint)}`,
          `Listing: ${JSON.stringify({ title: listing.title, description: listing.description, features: listing.features })}`,
          `Text match: ${JSON.stringify(textMatch)}`
        ].join('\n')
      },
      ...userImages.map((image) => ({ type: 'input_image', image_url: image.url, detail: 'auto' })),
      ...(listing.imageUrls ?? []).slice(0, 4).map((url) => ({ type: 'input_image', image_url: url, detail: 'auto' }))
    ];

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.openAiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.openAiModel,
        input: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI comparison vision failed (${response.status}): ${text.slice(0, 300)}`);
    }
    const data = await response.json();
    return parseJsonOutput(data);
  }
}

function parseJsonOutput(data) {
  const outputText = data.output_text
    ?? data.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean).join('\n')
    ?? '{}';
  const trimmed = outputText.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    log.warn('Vision provider returned non-JSON output.', { outputText: outputText.slice(0, 300) });
    return { notes: outputText.slice(0, 1000), confidence: {} };
  }
}

function heuristicExtract({ images, note, itemNameGuess }) {
  const text = [note, itemNameGuess, ...images.map((image) => image.filename)].filter(Boolean).join(' ');
  const normalized = normalizeText(text);
  const years = extractYears(text);
  const hasBackHit = images.some((image) => image.role === 'back') || includesAny(text, ['back hit', 'double sided', 'two sided']);
  const tagBrand = ['hanes', 'brockum', 'giant', 'anvil', 'screen stars', 'fruit of the loom', 'tultex']
    .find((brand) => normalized.includes(normalizeText(brand))) ?? null;
  const artistGuess = itemNameGuess || note?.split(/[,-]/)[0]?.trim() || null;

  return {
    likelyArtist: artistGuess,
    brandOrSubject: artistGuess,
    graphicSummary: note || itemNameGuess || null,
    tourOrAlbum: null,
    eraGuess: years[0] ?? null,
    decadeGuess: years[0] ? `${Math.floor(Number(years[0]) / 10) * 10}s` : null,
    visibleYear: years[0] ?? null,
    tagBrand,
    stitchType: includesAny(text, ['single stitch']) ? 'single stitch' : includesAny(text, ['double stitch']) ? 'double stitch' : null,
    hasBackHit,
    conditionFlags: ['faded', 'holes', 'stain', 'cracking', 'dry rot'].filter((flag) => normalized.includes(flag)),
    authenticityFlags: ['reprint', 'modern', 'bootleg'].filter((flag) => normalized.includes(flag)),
    graphicFamilyGuess: note || itemNameGuess || null,
    confidence: {
      artist: artistGuess ? 0.45 : 0.1,
      visibleYear: years[0] ? 0.8 : 0.1,
      tagBrand: tagBrand ? 0.7 : 0.1,
      stitchType: includesAny(text, ['single stitch', 'double stitch']) ? 0.7 : 0.1,
      graphicFamily: note || itemNameGuess ? 0.45 : 0.1
    },
    notes: 'Heuristic vision fallback used. Configure VISION_PROVIDER=openai or webhook for real image analysis.'
  };
}

function heuristicCompare({ listing, fingerprint, textMatch }) {
  const score = Math.max(0, Math.min(100, textMatch.score + (listing.imageUrls?.length ? 5 : 0)));
  const sameBackHitLayout = fingerprint.hasBackHit ? Boolean(listing.features?.hasBackHit) : null;
  return {
    visualSimilarityScore: score,
    sameFrontGraphicFamily: textMatch.score >= 55,
    sameBackHitLayout,
    sameTagFamily: fingerprint.tagBrand && listing.features?.tagBrand ? fingerprint.tagBrand === listing.features.tagBrand : null,
    sameLikelyVariant: score >= 75,
    classification: score >= 75 ? 'exact_match' : score >= 50 ? 'same_family_different_variant' : 'unclear',
    keyDifferences: sameBackHitLayout === false ? ['back hit not confirmed in listing'] : [],
    confidence: 0.35,
    notes: 'Heuristic comparison fallback used. Configure a vision provider for image-level matching.'
  };
}
