import { readFile } from 'node:fs/promises';
import { createId } from '../utils/ids.js';

export class PostgresStore {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.pool = null;
  }

  async init() {
    const { Pool } = await import('pg');
    this.pool = new Pool({
      connectionString: this.databaseUrl,
      ssl: this.databaseUrl.includes('railway') || this.databaseUrl.includes('render') ? { rejectUnauthorized: false } : undefined
    });
  }

  async migrate(schemaPath = 'db/schema.sql') {
    const sql = await readFile(schemaPath, 'utf8');
    await this.pool.query(sql);
  }

  async createSubmission(input) {
    const id = input.id ?? createId('sub');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO submissions (id, discord_user_id, guild_id, channel_id, raw_note, item_name_guess)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, input.discordUserId, input.guildId, input.channelId, input.rawNote ?? '', input.itemNameGuess ?? '']
      );
      for (let index = 0; index < input.images.length; index += 1) {
        const image = input.images[index];
        await client.query(
          `INSERT INTO submission_images (id, submission_id, role, url, filename, content_type, original_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [image.id ?? createId('img'), id, image.role, image.url, image.filename ?? '', image.contentType ?? '', index]
        );
      }
      await client.query('COMMIT');
      return mapSubmission(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveFingerprint(submissionId, fingerprint, visionModel) {
    await this.pool.query(
      `INSERT INTO shirt_fingerprints (submission_id, fingerprint, vision_model)
       VALUES ($1, $2, $3)
       ON CONFLICT (submission_id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, vision_model = EXCLUDED.vision_model`,
      [submissionId, fingerprint, visionModel]
    );
  }

  async saveQueries(submissionId, queries) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM queries WHERE submission_id = $1', [submissionId]);
      for (const query of queries) {
        await client.query(
          `INSERT INTO queries (id, submission_id, query_text, query_type, priority, fields_used, debug_notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [createId('qry'), submissionId, query.queryText, query.queryType, query.priority, JSON.stringify(query.fieldsUsed ?? []), query.debugNotes ?? '']
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertListings(listings) {
    for (const listing of listings) {
      await this.pool.query(
        `INSERT INTO listings (id, source, external_source_id, url, title, description, price, currency, sold, sold_date, image_urls, raw_payload, features)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (source, external_source_id) DO UPDATE SET
           url = EXCLUDED.url,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           sold = EXCLUDED.sold,
           sold_date = EXCLUDED.sold_date,
           scraped_at = NOW(),
           image_urls = EXCLUDED.image_urls,
           raw_payload = EXCLUDED.raw_payload,
           features = EXCLUDED.features`,
        [
          listing.id,
          listing.source,
          listing.externalSourceId,
          listing.url,
          listing.title,
          listing.description ?? '',
          listing.price,
          listing.currency ?? 'USD',
          listing.sold !== false,
          listing.soldDate ?? null,
          JSON.stringify(listing.imageUrls ?? []),
          JSON.stringify(listing.rawPayload ?? {}),
          JSON.stringify(listing.features ?? {})
        ]
      );
    }
    return listings;
  }

  async findListingsForQueries(queries, limit = 60) {
    const words = [...new Set(queries.flatMap((query) => query.queryText.split(/\s+/)).filter((word) => word.length > 2 && !word.startsWith('-')))];
    if (!words.length) return [];
    const pattern = words.slice(0, 8).map((word) => `%${word}%`);
    const result = await this.pool.query(
      `SELECT * FROM listings
       WHERE ${pattern.map((_, index) => `title ILIKE $${index + 1}`).join(' OR ')}
       ORDER BY scraped_at DESC
       LIMIT $${pattern.length + 1}`,
      [...pattern, limit]
    );
    return result.rows.map(mapListing);
  }

  async saveListingMatches(submissionId, matches) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM listing_matches WHERE submission_id = $1', [submissionId]);
      for (const match of matches) {
        await client.query(
          `INSERT INTO listing_matches (id, submission_id, listing_id, text_score, vision_score, final_label, confidence, needs_review, reasons, score_breakdown)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            match.id ?? createId('mtc'),
            submissionId,
            match.listingId,
            match.textScore,
            match.visionScore,
            match.finalLabel,
            match.confidence,
            match.needsReview,
            JSON.stringify(match.reasons ?? []),
            JSON.stringify(match.scoreBreakdown ?? {})
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async savePriceSnapshot(submissionId, snapshot) {
    const id = snapshot.id ?? createId('prc');
    const result = await this.pool.query(
      `INSERT INTO price_snapshots (id, submission_id, best_estimate, low_range, high_range, currency, confidence, trusted_comp_count, notes, comp_ids_used, pricing_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        submissionId,
        snapshot.bestEstimate,
        snapshot.lowRange,
        snapshot.highRange,
        snapshot.currency,
        snapshot.confidence,
        snapshot.trustedCompCount,
        JSON.stringify(snapshot.notes ?? []),
        JSON.stringify(snapshot.compIdsUsed ?? []),
        snapshot.pricingVersion
      ]
    );
    await this.pool.query(`UPDATE submissions SET status = 'priced', updated_at = NOW() WHERE id = $1`, [submissionId]);
    return mapPriceSnapshot(result.rows[0]);
  }

  async createDiscordPost(input) {
    const id = createId('dsp');
    const result = await this.pool.query(
      `INSERT INTO discord_posts (id, submission_id, channel_id, message_id, post_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_id, message_id) DO NOTHING
       RETURNING *`,
      [id, input.submissionId, input.channelId, input.messageId, input.postType]
    );
    return result.rows[0] ?? null;
  }

  async saveReviewLabel(input) {
    const result = await this.pool.query(
      `INSERT INTO review_labels (id, submission_id, listing_id, result_id, reviewer_discord_id, label, reason, score_at_prediction, model_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        createId('rev'),
        input.submissionId,
        input.listingId ?? null,
        input.resultId ?? null,
        input.reviewerDiscordId,
        input.label,
        input.reason ?? '',
        JSON.stringify(input.scoreAtPrediction ?? {}),
        input.modelVersion ?? ''
      ]
    );
    return result.rows[0];
  }

  async getSubmissionDetail(submissionId) {
    const submission = await this.pool.query('SELECT * FROM submissions WHERE id = $1', [submissionId]);
    if (!submission.rows[0]) return null;
    const [images, fingerprint, queries, matches, snapshot, reviews] = await Promise.all([
      this.pool.query('SELECT * FROM submission_images WHERE submission_id = $1 ORDER BY original_order ASC', [submissionId]),
      this.pool.query('SELECT * FROM shirt_fingerprints WHERE submission_id = $1', [submissionId]),
      this.pool.query('SELECT * FROM queries WHERE submission_id = $1 ORDER BY priority ASC', [submissionId]),
      this.pool.query(
        `SELECT lm.*, row_to_json(l.*) AS listing
         FROM listing_matches lm
         JOIN listings l ON l.id = lm.listing_id
         WHERE lm.submission_id = $1
         ORDER BY lm.confidence DESC`,
        [submissionId]
      ),
      this.pool.query('SELECT * FROM price_snapshots WHERE submission_id = $1 ORDER BY created_at DESC LIMIT 1', [submissionId]),
      this.pool.query('SELECT * FROM review_labels WHERE submission_id = $1 ORDER BY created_at DESC', [submissionId])
    ]);

    return {
      submission: mapSubmission(submission.rows[0]),
      images: images.rows.map(mapImage),
      fingerprint: fingerprint.rows[0]?.fingerprint ?? null,
      queries: queries.rows.map(mapQuery),
      matches: matches.rows.map((row) => ({
        id: row.id,
        submissionId: row.submission_id,
        listingId: row.listing_id,
        textScore: Number(row.text_score),
        visionScore: row.vision_score == null ? null : Number(row.vision_score),
        finalLabel: row.final_label,
        confidence: Number(row.confidence),
        needsReview: row.needs_review,
        reasons: row.reasons,
        scoreBreakdown: row.score_breakdown,
        listing: mapListing(row.listing)
      })),
      priceSnapshot: snapshot.rows[0] ? mapPriceSnapshot(snapshot.rows[0]) : null,
      reviews: reviews.rows
    };
  }

  async listUnreviewed(limit = 10) {
    const result = await this.pool.query(
      `SELECT ps.*
       FROM price_snapshots ps
       WHERE NOT EXISTS (
         SELECT 1 FROM review_labels rl WHERE rl.submission_id = ps.submission_id
       )
       ORDER BY ps.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapPriceSnapshot);
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
      features: input.features ?? {}
    };
    await this.upsertListings([listing]);
    return listing;
  }
}

function mapSubmission(row) {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    rawNote: row.raw_note,
    itemNameGuess: row.item_name_guess,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapImage(row) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    role: row.role,
    url: row.url,
    filename: row.filename,
    contentType: row.content_type,
    originalOrder: row.original_order
  };
}

function mapQuery(row) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    queryText: row.query_text,
    queryType: row.query_type,
    priority: row.priority,
    fieldsUsed: row.fields_used,
    debugNotes: row.debug_notes
  };
}

function mapListing(row) {
  return {
    id: row.id,
    source: row.source,
    externalSourceId: row.external_source_id,
    url: row.url,
    title: row.title,
    description: row.description,
    price: row.price == null ? null : Number(row.price),
    currency: row.currency,
    sold: row.sold,
    soldDate: row.sold_date,
    imageUrls: row.image_urls ?? [],
    rawPayload: row.raw_payload ?? {},
    features: row.features ?? {},
    scrapedAt: row.scraped_at
  };
}

function mapPriceSnapshot(row) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    bestEstimate: row.best_estimate == null ? null : Number(row.best_estimate),
    lowRange: row.low_range == null ? null : Number(row.low_range),
    highRange: row.high_range == null ? null : Number(row.high_range),
    currency: row.currency,
    confidence: row.confidence,
    trustedCompCount: row.trusted_comp_count,
    notes: row.notes ?? [],
    compIdsUsed: row.comp_ids_used ?? [],
    pricingVersion: row.pricing_version,
    createdAt: row.created_at
  };
}
