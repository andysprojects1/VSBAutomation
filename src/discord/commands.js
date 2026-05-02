import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('pricecheck')
    .setDescription('Price check a vintage tee from photos and notes.')
    .addAttachmentOption((option) => option.setName('front').setDescription('Front shirt photo').setRequired(true))
    .addAttachmentOption((option) => option.setName('back').setDescription('Optional back shirt photo'))
    .addAttachmentOption((option) => option.setName('tag').setDescription('Optional tag photo'))
    .addStringOption((option) => option.setName('note').setDescription('Visible text, artist, era clues, condition, etc.').setMaxLength(800))
    .addStringOption((option) => option.setName('guess').setDescription('Optional item name guess').setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('identify')
    .setDescription('Extract a structured shirt identity without pricing.')
    .addAttachmentOption((option) => option.setName('front').setDescription('Front shirt photo').setRequired(true))
    .addAttachmentOption((option) => option.setName('back').setDescription('Optional back shirt photo'))
    .addAttachmentOption((option) => option.setName('tag').setDescription('Optional tag photo'))
    .addStringOption((option) => option.setName('note').setDescription('Visible text, artist, era clues, condition, etc.').setMaxLength(800))
    .addStringOption((option) => option.setName('guess').setDescription('Optional item name guess').setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('explain')
    .setDescription('Show why a price check got its result.')
    .addStringOption((option) => option.setName('submission_id').setDescription('Submission ID from a result card').setRequired(true)),
  new SlashCommandBuilder()
    .setName('review')
    .setDescription('Show recent unreviewed price checks.')
    .addIntegerOption((option) => option.setName('limit').setDescription('How many to show').setMinValue(1).setMaxValue(10)),
  new SlashCommandBuilder()
    .setName('addcomp')
    .setDescription('Manually add a sold comp to the database.')
    .addStringOption((option) => option.setName('title').setDescription('Sold listing title').setRequired(true).setMaxLength(300))
    .addNumberOption((option) => option.setName('price').setDescription('Sold price').setRequired(true).setMinValue(1))
    .addStringOption((option) => option.setName('url').setDescription('Listing URL').setMaxLength(500))
    .addStringOption((option) => option.setName('sold_date').setDescription('Sold date, like 2025-12-31').setMaxLength(40))
    .addStringOption((option) => option.setName('description').setDescription('Extra listing details').setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('refreshcomps')
    .setDescription('Rerun a previous submission against current stored and eBay comps.')
    .addStringOption((option) => option.setName('submission_id').setDescription('Submission ID').setRequired(true))
].map((command) => command.toJSON());
