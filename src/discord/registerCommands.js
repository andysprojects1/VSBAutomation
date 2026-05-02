import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';

export async function registerCommands(config) {
  if (!config.discord.clientId || !config.discord.token) {
    throw new Error('DISCORD_CLIENT_ID and DISCORD_TOKEN are required to register commands.');
  }
  if (!/^\d{16,22}$/.test(config.discord.clientId)) {
    throw new Error('DISCORD_CLIENT_ID should be the numeric Application ID from Discord Developer Portal.');
  }
  if (config.discord.guildId && !/^\d{16,22}$/.test(config.discord.guildId)) {
    throw new Error('DISCORD_GUILD_ID should be the numeric Server ID copied from Discord.');
  }
  if (config.discord.token.startsWith('Bot ')) {
    throw new Error('DISCORD_TOKEN should be the raw bot token only, without the "Bot " prefix.');
  }
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  if (config.discord.guildId) {
    return rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );
  }
  return rest.put(
    Routes.applicationCommands(config.discord.clientId),
    { body: commands }
  );
}
