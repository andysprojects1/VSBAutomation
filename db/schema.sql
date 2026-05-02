CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  discord_user_id TEXT,
  guild_id TEXT,
  channel_id TEXT,
  raw_note TEXT,
  item_name_guess TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_images (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  original_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shirt_fingerprints (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  fingerprint JSONB NOT NULL,
  vision_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queries (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  fields_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  debug_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_source_id TEXT NOT NULL,
  url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2),
  currency TEXT DEFAULT 'USD',
  sold BOOLEAN NOT NULL DEFAULT TRUE,
  sold_date TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source, external_source_id)
);

CREATE INDEX IF NOT EXISTS listings_title_idx ON listings USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS listings_sold_date_idx ON listings (sold_date DESC);

CREATE TABLE IF NOT EXISTS listing_matches (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  text_score NUMERIC(6, 3) NOT NULL DEFAULT 0,
  vision_score NUMERIC(6, 3),
  final_label TEXT NOT NULL,
  confidence NUMERIC(6, 3) NOT NULL DEFAULT 0,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, listing_id)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  best_estimate NUMERIC(12, 2),
  low_range NUMERIC(12, 2),
  high_range NUMERIC(12, 2),
  currency TEXT DEFAULT 'USD',
  confidence TEXT NOT NULL,
  trusted_comp_count INTEGER NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  comp_ids_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_labels (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  listing_id TEXT,
  result_id TEXT,
  reviewer_discord_id TEXT,
  label TEXT NOT NULL,
  reason TEXT,
  score_at_prediction JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discord_posts (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  post_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, message_id)
);

CREATE TABLE IF NOT EXISTS shirt_clusters (
  id TEXT PRIMARY KEY,
  canonical_piece_name TEXT NOT NULL,
  artist TEXT,
  era TEXT,
  tour_album TEXT,
  graphic_family TEXT,
  known_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  representative_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_images (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  original_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
