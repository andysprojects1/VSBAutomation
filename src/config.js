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

function stringFromEnv(name, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function firstStringFromEnv(names, fallback = '') {
  for (const name of names) {
    const value = stringFromEnv(name);
    if (value) return value;
  }
  return fallback;
}

export function getConfig() {
  const useSandbox = boolFromEnv('EBAY_USE_SANDBOX');
  const databaseUrl = firstStringFromEnv(['DATABASE_URL', 'POSTGRES_URL', 'DATABASE_PUBLIC_URL']);
  return {
    port: intFromEnv('PORT', 3000),
    discord: {
      token: stringFromEnv('DISCORD_TOKEN'),
      clientId: stringFromEnv('DISCORD_CLIENT_ID'),
      guildId: stringFromEnv('DISCORD_GUILD_ID'),
      reviewChannelId: stringFromEnv('REVIEW_CHANNEL_ID'),
      adminChannelId: stringFromEnv('ADMIN_CHANNEL_ID'),
      scraperLogChannelId: stringFromEnv('SCRAPER_LOG_CHANNEL_ID'),
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
