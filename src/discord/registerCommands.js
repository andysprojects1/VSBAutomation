import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';

export async function registerCommands(config) {
  if (!config.discord.clientId || !config.discord.token) {
    throw new Error('DISCORD_CLIENT_ID and DISCORD_TOKEN are required to register commands.');
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
