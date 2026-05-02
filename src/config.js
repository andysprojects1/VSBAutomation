import { existsSync, readFileSync } from 'node:fs';

loadLocalEnv();

function loadLocalEnv() {
  const path = '.env';
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (process.env[key] != null) continue;
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function listFromEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function getConfig() {
  const useSandbox = boolFromEnv('EBAY_USE_SANDBOX');
  return {
    port: intFromEnv('PORT', 3000),
    discord: {
      token: process.env.DISCORD_TOKEN ?? '',
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      guildId: process.env.DISCORD_GUILD_ID ?? '',
      reviewChannelId: process.env.REVIEW_CHANNEL_ID ?? '',
      adminChannelId: process.env.ADMIN_CHANNEL_ID ?? '',
      scraperLogChannelId: process.env.SCRAPER_LOG_CHANNEL_ID ?? '',
      autoRegisterCommands: boolFromEnv('AUTO_REGISTER_COMMANDS', true)
    },
    storage: {
      driver: process.env.STORE_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'json'),
      databaseUrl: process.env.DATABASE_URL ?? '',
      jsonPath: process.env.JSON_STORE_PATH ?? 'data/local-store.json'
    },
    ebay: {
      clientId: process.env.EBAY_CLIENT_ID ?? '',
      clientSecret: process.env.EBAY_CLIENT_SECRET ?? '',
      marketplaceId: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
      categoryIds: listFromEnv('EBAY_CATEGORY_IDS'),
      useSandbox,
      baseUrl: useSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com',
      oauthUrl: useSandbox ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' : 'https://api.ebay.com/identity/v1/oauth2/token',
      enableActiveFallback: boolFromEnv('EBAY_ENABLE_ACTIVE_FALLBACK'),
      maxCompsPerQuery: intFromEnv('MAX_COMPS_PER_QUERY', 15)
    },
    vision: {
      provider: process.env.VISION_PROVIDER || 'heuristic',
      openAiApiKey: process.env.OPENAI_API_KEY ?? '',
      openAiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      webhookUrl: process.env.VISION_WEBHOOK_URL ?? '',
      webhookToken: process.env.VISION_WEBHOOK_TOKEN ?? ''
    },
    pipeline: {
      maxVisionComparisons: intFromEnv('MAX_VISION_COMPARISONS', 5),
      pricingVersion: 'weighted-median-v1',
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? ''
    }
  };
}

export function assertBotConfig(config) {
  const missing = validateBotConfig(config);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function validateBotConfig(config) {
  const missing = [];
  if (!config.discord.token) missing.push('DISCORD_TOKEN');
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (config.storage.driver === 'postgres' && !config.storage.databaseUrl) missing.push('DATABASE_URL');
  return missing;
}
