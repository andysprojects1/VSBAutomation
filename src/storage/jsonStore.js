import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createId } from '../utils/ids.js';

const EMPTY = {
  submissions: [],
  submissionImages: [],
  fingerprints: [],
  queries: [],
  listings: [],
  matches: [],
  priceSnapshots: [],
  reviewLabels: [],
  discordPosts: [],
  clusters: []
};

export class JsonStore {
  constructor(path) {
    this.path = path;
    this.data = structuredClone(EMPTY);
  }

  async init() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      await this.flush();
    }
  }

  async flush() {
    await writeFile(this.path, JSON.stringify(this.data, null, 2));
  }

  async createSubmission(input) {
    const now = new Date().toISOString();
    const submission = {
      id: input.id ?? createId('sub'),
      discordUserId: input.discordUserId,
      guildId: input.guildId,
      channelId: input.channelId,
      rawNote: input.rawNote ?? '',
      itemNameGuess: input.itemNameGuess ?? '',
      status: 'new',
      createdAt: now,
      updatedAt: now
    };
    this.data.submissions.push(submission);
    input.images.forEach((image, index) => {
      this.data.submissionImages.push({
        id: image.id ?? createId('img'),
        submissionId: submission.id,
        role: image.role,
        url: image.url,
        filename: image.filename ?? '',
        contentType: image.contentType ?? '',
        originalOrder: index,
        createdAt: now
      });
    });
    await this.flush();
    return submission;
  }

  async saveFingerprint(submissionId, fingerprint, visionModel) {
    this.data.fingerprints = this.data.fingerprints.filter((item) => item.submissionId !== submissionId);
    this.data.fingerprints.push({ submissionId, fingerprint, visionModel, createdAt: new Date().toISOString() });
    await this.flush();
  }

  async saveQueries(submissionId, queries) {
    this.data.queries = this.data.queries.filter((item) => item.submissionId !== submissionId);
    this.data.queries.push(...queries.map((query) => ({ id: createId('qry'), submissionId, ...query, createdAt: new Date().toISOString() })));
    await this.flush();
  }

  async upsertListings(listings) {
    for (const listing of listings) {
      const existingIndex = this.data.listings.findIndex((item) => item.source === listing.source && item.externalSourceId === listing.externalSourceId);
      const saved = {
        ...listing,
        scrapedAt: listing.scrapedAt ?? new Date().toISOString()
      };
      if (existingIndex >= 0) {
        this.data.listings[existingIndex] = { ...this.data.listings[existingIndex], ...saved };
      } else {
        this.data.listings.push(saved);
      }
    }
    await this.flush();
    return listings;
  }

  async findListingsForQueries(queries, limit = 60) {
    const terms = queries.flatMap((query) => query.queryText.toLowerCase().split(/\s+/).filter((word) => word.length > 2 && !word.startsWith('-')));
    const scored = this.data.listings.map((listing) => {
      const text = `${listing.title} ${listing.description ?? ''}`.toLowerCase();
      return { listing, score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) };
    });
    return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.listing);
  }

  async saveListingMatches(submissionId, matches) {
    this.data.matches = this.data.matches.filter((item) => item.submissionId !== submissionId);
    this.data.matches.push(...matches.map((match) => ({ id: match.id ?? createId('mtc'), submissionId, ...match, createdAt: new Date().toISOString() })));
    await this.flush();
  }

  async savePriceSnapshot(submissionId, snapshot) {
    const saved = { ...snapshot, id: snapshot.id ?? createId('prc'), submissionId, createdAt: new Date().toISOString() };
    this.data.priceSnapshots.push(saved);
    this.data.submissions = this.data.submissions.map((submission) => submission.id === submissionId ? { ...submission, status: 'priced', updatedAt: new Date().toISOString() } : submission);
    await this.flush();
    return saved;
  }

  async createDiscordPost(input) {
    const saved = { id: createId('dsp'), ...input, createdAt: new Date().toISOString() };
    this.data.discordPosts.push(saved);
    await this.flush();
    return saved;
  }

  async saveReviewLabel(input) {
    const saved = { id: createId('rev'), ...input, createdAt: new Date().toISOString() };
    this.data.reviewLabels.push(saved);
    await this.flush();
    return saved;
  }

  async getSubmissionDetail(submissionId) {
    const submission = this.data.submissions.find((item) => item.id === submissionId);
    if (!submission) return null;
    return {
      submission,
      images: this.data.submissionImages.filter((item) => item.submissionId === submissionId),
      fingerprint: this.data.fingerprints.find((item) => item.submissionId === submissionId)?.fingerprint ?? null,
      queries: this.data.queries.filter((item) => item.submissionId === submissionId),
      matches: this.data.matches.filter((item) => item.submissionId === submissionId).map((match) => ({
        ...match,
        listing: this.data.listings.find((listing) => listing.id === match.listingId)
      })),
      priceSnapshot: this.data.priceSnapshots.filter((item) => item.submissionId === submissionId).at(-1) ?? null,
      reviews: this.data.reviewLabels.filter((item) => item.submissionId === submissionId)
    };
  }

  async listUnreviewed(limit = 10) {
    const reviewed = new Set(this.data.reviewLabels.map((item) => item.submissionId));
    return this.data.priceSnapshots
      .filter((snapshot) => !reviewed.has(snapshot.submissionId))
      .slice(-limit)
      .reverse();
  }

  async addManualListing(input) {
    const listing = {
      id: input.id ?? createId('lst_manual'),
      source: 'manual',
      externalSourceId: input.url || input.title,
      url: input.url ?? '',
      title: input.title,
      description: input.description ?? '',
      price: Number(input.price),
      currency: input.currency ?? 'USD',
      sold: true,
      soldDate: input.soldDate ?? null,
      imageUrls: input.imageUrls ?? [],
      rawPayload: { manual: true },
      features: input.features ?? {},
      scrapedAt: new Date().toISOString()
    };
    await this.upsertListings([listing]);
    return listing;
  }
}
