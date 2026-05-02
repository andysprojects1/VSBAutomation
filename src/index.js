import http from 'node:http';
import { getConfig, assertBotConfig } from './config.js';
import { createStore } from './storage/store.js';
import { EbayClient } from './integrations/ebay.js';
import { VisionService } from './integrations/vision.js';
import { createBot } from './discord/bot.js';
import { registerCommands } from './discord/registerCommands.js';
import { createLogger } from './utils/log.js';

const log = createLogger('app');
const config = getConfig();
assertBotConfig(config);

const store = createStore(config.storage);
await store.init();
if (config.storage.driver === 'postgres') {
  await store.migrate();
}

const ebayClient = new EbayClient(config.ebay);
const visionService = new VisionService(config.vision);
const bot = createBot({ config, store, ebayClient, visionService });

if (config.discord.autoRegisterCommands) {
  await registerCommands(config);
  log.info('Discord slash commands registered.', {
    scope: config.discord.guildId ? 'guild' : 'global'
  });
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Vintage tee price checker bot is running.\n');
});

server.listen(config.port, () => {
  log.info('Health server listening.', { port: config.port });
});

await bot.login(config.discord.token);

process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down.');
  bot.destroy();
  server.close(() => process.exit(0));
});
