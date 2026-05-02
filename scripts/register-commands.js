import { getConfig } from '../src/config.js';
import { registerCommands } from '../src/discord/registerCommands.js';

const config = getConfig();
await registerCommands(config);
console.log('Discord commands registered.');
