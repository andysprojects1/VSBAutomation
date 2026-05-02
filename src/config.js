import { existsSync, readFileSync } from 'node:fs';

loadLocalEnv();
loadRailwayInlineEnv();

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

function loadRailwayInlineEnv() {
  const raw = process.env.APP_ENV || process.env.PRICE_BOT_ENV || '';
  if (!raw.trim()) return;
  for (const assignment of raw.split(/\r?\n|;/)) {
    const trimmed = assignment.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim();
    if (!key || process.env[key]) continue;
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

function stringFromEnv(name, fallback = '') {
  let value = (process.env[name] ?? fallback).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function firstStringFromEnv(names, fallback = '') {
  for (const name of names) {
    const value = stringFromEnv(name);
    if (value) return value;
  }
  return fallback;
}

function optionalIdFromEnv(names) {
  const value = Array.isArray(names) ? firstStringFromEnv(names) : stringFromEnv(names);
  if (!value || value.startsWith('PASTE_') || value.includes('_HERE')) return '';
  return value;
}

export function getConfig() {
  const useSandbox = boolFromEnv('EBAY_USE_SANDBOX');
  const databaseUrl = firstStringFromEnv(['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRIVATE_URL', 'DATABASE_PUBLIC_URL'])
    || buildPostgresUrlFromParts();
  return {
    port: intFromEnv('PORT', 3000),
    discord: {
      token: stringFromEnv('DISCORD_TOKEN'),
      clientId: stringFromEnv('DISCORD_CLIENT_ID'),
      guildId: stringFromEnv('DISCORD_GUILD_ID'),
      reviewChannelId: optionalIdFromEnv('REVIEW_CHANNEL_ID'),
      adminChannelId: optionalIdFromEnv('ADMIN_CHANNEL_ID'),
      scraperLogChannelId: optionalIdFromEnv(['SCRAPER_LOG_CHANNEL_ID', 'SCRAPER_LOG_CHANNEL']),
      autoRegisterCommands: boolFromEnv('AUTO_REGISTER_COMMANDS', true)
    },
    storage: {
      driver: stringFromEnv('STORE_DRIVER') || (databaseUrl ? 'postgres' : 'json'),
      databaseUrl,
      ssl: boolFromEnv('DATABASE_SSL', false),
      jsonPath: stringFromEnv('JSON_STORE_PATH', 'data/local-store.json')
    },
    ebay: {
      clientId: stringFromEnv('EBAY_CLIENT_ID'),
      clientSecret: stringFromEnv('EBAY_CLIENT_SECRET'),
      marketplaceId: stringFromEnv('EBAY_MARKETPLACE_ID', 'EBAY_US'),
      categoryIds: listFromEnv('EBAY_CATEGORY_IDS'),
      useSandbox,
      baseUrl: useSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com',
      oauthUrl: useSandbox ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' : 'https://api.ebay.com/identity/v1/oauth2/token',
      enableActiveFallback: boolFromEnv('EBAY_ENABLE_ACTIVE_FALLBACK'),
      maxCompsPerQuery: intFromEnv('MAX_COMPS_PER_QUERY', 15)
    },
    vision: {
      provider: stringFromEnv('VISION_PROVIDER', 'heuristic'),
      openAiApiKey: stringFromEnv('OPENAI_API_KEY'),
      openAiModel: stringFromEnv('OPENAI_MODEL', 'gpt-4.1-mini'),
      webhookUrl: stringFromEnv('VISION_WEBHOOK_URL'),
      webhookToken: stringFromEnv('VISION_WEBHOOK_TOKEN')
    },
    pipeline: {
      maxVisionComparisons: intFromEnv('MAX_VISION_COMPARISONS', 5),
      pricingVersion: 'weighted-median-v1',
      publicBaseUrl: stringFromEnv('PUBLIC_BASE_URL')
    }
  };
}

export function buildStartupDiagnostics(config) {
  return {
    discord: {
      hasToken: Boolean(config.discord.token),
      tokenLength: config.discord.token.length,
      tokenDotCount: (config.discord.token.match(/\./g) ?? []).length,
      tokenStartsWithBotPrefix: config.discord.token.startsWith('Bot '),
      clientId: config.discord.clientId || null,
      guildId: config.discord.guildId || null,
      reviewChannelId: config.discord.reviewChannelId || null,
      adminChannelId: config.discord.adminChannelId || null,
      scraperLogChannelId: config.discord.scraperLogChannelId || null
    },
    storage: {
      driver: config.storage.driver,
      hasDatabaseUrl: Boolean(config.storage.databaseUrl),
      databaseUrlLength: config.storage.databaseUrl.length,
      databaseSsl: config.storage.ssl,
      pgPartsPresent: {
        PGHOST: Boolean(stringFromEnv('PGHOST')),
        PGPORT: Boolean(stringFromEnv('PGPORT')),
        PGDATABASE: Boolean(stringFromEnv('PGDATABASE')),
        PGUSER: Boolean(stringFromEnv('PGUSER')),
        PGPASSWORD: Boolean(stringFromEnv('PGPASSWORD'))
      }
    },
    ebay: {
      hasClientId: Boolean(config.ebay.clientId),
      hasClientSecret: Boolean(config.ebay.clientSecret),
      marketplaceId: config.ebay.marketplaceId
    }
  };
}

function buildPostgresUrlFromParts() {
  const host = stringFromEnv('PGHOST');
  const port = stringFromEnv('PGPORT', '5432');
  const database = stringFromEnv('PGDATABASE');
  const user = stringFromEnv('PGUSER');
  const password = stringFromEnv('PGPASSWORD');
  if (!host || !database || !user || !password) return '';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
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
  if (config.discord.token && config.discord.token.startsWith('Bot ')) missing.push('DISCORD_TOKEN must not include the "Bot " prefix');
  return missing;
}
