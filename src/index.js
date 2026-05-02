import http from 'node:http';
import { getConfig, validateBotConfig } from './config.js';
import { createStore } from './storage/store.js';
import { JsonStore } from './storage/jsonStore.js';
import { EbayClient } from './integrations/ebay.js';
import { VisionService } from './integrations/vision.js';
import { createBot } from './discord/bot.js';
import { registerCommands } from './discord/registerCommands.js';
import { createLogger } from './utils/log.js';
import { describeError } from './utils/errors.js';

const log = createLogger('app');
const config = getConfig();
const startup = {
  ready: false,
  botLoggedIn: false,
  commandRegistration: 'pending',
  storage: config.storage.driver,
  errors: []
};

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      ok: startup.errors.length === 0,
      time: new Date().toISOString(),
      ...startup
    }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Vintage tee price checker bot is running.\n');
});

server.listen(config.port, () => {
  log.info('Health server listening.', { port: config.port });
});

const validationErrors = validateBotConfig(config);
for (const error of validationErrors) {
  startup.errors.push(error);
  log.error('Configuration error.', { error });
}

let store = createStore(config.storage);
try {
  await store.init();
  if (config.storage.driver === 'postgres') {
    await store.migrate();
  }
} catch (error) {
  startup.errors.push(`Storage startup failed: ${describeError(error)}`);
  log.error('Storage startup failed. Falling back to local JSON storage for process stability.', { error: describeError(error), stack: error.stack });
  store = new JsonStore(config.storage.jsonPath);
  startup.storage = 'json-fallback';
  await store.init();
}

const ebayClient = new EbayClient(config.ebay);
const visionService = new VisionService(config.vision);
const bot = createBot({ config, store, ebayClient, visionService });

if (config.discord.autoRegisterCommands && config.discord.token && config.discord.clientId) {
  try {
    await registerCommands(config);
    startup.commandRegistration = 'registered';
    log.info('Discord slash commands registered.', {
      scope: config.discord.guildId ? 'guild' : 'global'
    });
  } catch (error) {
    startup.commandRegistration = 'failed';
    const detail = describeError(error);
    startup.errors.push(`Command registration failed: ${detail}`);
    log.error('Discord slash command registration failed.', { error: detail, stack: error.stack });
    console.error(`DISCORD_COMMAND_REGISTRATION_ERROR ${detail}`);
  }
} else {
  startup.commandRegistration = 'skipped';
}

if (config.discord.token) {
  try {
    await bot.login(config.discord.token);
    startup.botLoggedIn = true;
    startup.ready = startup.errors.length === 0;
  } catch (error) {
    startup.botLoggedIn = false;
    const detail = describeError(error);
    startup.errors.push(`Discord login failed: ${detail}`);
    log.error('Discord login failed. Check DISCORD_TOKEN in Railway.', { error: detail, stack: error.stack });
    console.error(`DISCORD_LOGIN_ERROR ${detail}`);
  }
} else {
  log.error('Discord token is missing. Set DISCORD_TOKEN in Railway variables.');
}

process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down.');
  bot.destroy();
  server.close(() => process.exit(0));
});
