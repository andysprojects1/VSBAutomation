import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { buildFingerprint } from '../pipeline/fingerprint.js';
import { generateQueries } from '../pipeline/queryGenerator.js';
import { runPriceCheck } from '../pipeline/priceCheck.js';
import { extractListingFeatures } from '../pipeline/listingFeatures.js';
import { buildExplainText, buildResultMessage } from './cards.js';
import { createLogger } from '../utils/log.js';

const log = createLogger('discord');

export function createBot({ config, store, ebayClient, visionService }) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel]
  });

  client.once('ready', () => {
    log.info('Discord bot ready.', { user: client.user?.tag });
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, { config, store, ebayClient, visionService, client });
      } else if (interaction.isButton()) {
        await handleButton(interaction, { store });
      }
    } catch (error) {
      log.error('Interaction failed.', { error: error.stack ?? error.message });
      const content = `Something went wrong: ${error.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
    }
  });

  return client;
}

async function handleCommand(interaction, deps) {
  switch (interaction.commandName) {
    case 'pricecheck':
      return handlePriceCheck(interaction, deps);
    case 'identify':
      return handleIdentify(interaction, deps);
    case 'explain':
      return handleExplain(interaction, deps);
    case 'review':
      return handleReview(interaction, deps);
    case 'addcomp':
      return handleAddComp(interaction, deps);
    case 'refreshcomps':
      return handleRefreshComps(interaction, deps);
    default:
      return interaction.reply({ content: 'Unknown command.', ephemeral: true });
  }
}

async function handlePriceCheck(interaction, { config, store, ebayClient, visionService, client }) {
  await interaction.deferReply({ ephemeral: true });
  const images = collectImages(interaction);
  if (!images.length) {
    await interaction.editReply('Please attach at least a front image.');
    return;
  }

  const input = {
    discordUserId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    rawNote: interaction.options.getString('note') ?? '',
    itemNameGuess: interaction.options.getString('guess') ?? '',
    images
  };

  const result = await runPriceCheck({ store, ebayClient, visionService, config, input });
  result.inputImages = images;
  const messagePayload = buildResultMessage(result);
  const targetChannelId = config.discord.reviewChannelId || interaction.channelId;
  const targetChannel = await client.channels.fetch(targetChannelId);
  const post = await targetChannel.send(messagePayload);
  await store.createDiscordPost({
    submissionId: result.submission.id,
    channelId: post.channelId,
    messageId: post.id,
    postType: 'price_result'
  });
  await interaction.editReply(`Price check created: \`${result.submission.id}\``);
}

async function handleIdentify(interaction, { config, visionService }) {
  await interaction.deferReply({ ephemeral: true });
  const images = collectImages(interaction);
  const vision = await visionService.extractShirt({
    images,
    note: interaction.options.getString('note') ?? '',
    itemNameGuess: interaction.options.getString('guess') ?? ''
  });
  const fingerprint = buildFingerprint({
    submissionId: 'preview',
    note: interaction.options.getString('note') ?? '',
    itemNameGuess: interaction.options.getString('guess') ?? '',
    images,
    vision
  });
  const queries = generateQueries(fingerprint);
  await interaction.editReply([
    'Structured identity:',
    `\`\`\`json\n${JSON.stringify({ fingerprint, queries, visionProvider: config.vision.provider }, null, 2).slice(0, 1800)}\n\`\`\``
  ].join('\n'));
}

async function handleExplain(interaction, { store }) {
  await interaction.deferReply({ ephemeral: true });
  const id = interaction.options.getString('submission_id', true);
  const detail = await store.getSubmissionDetail(id);
  await interaction.editReply(buildExplainText(detail));
}

async function handleReview(interaction, { store }) {
  await interaction.deferReply({ ephemeral: true });
  const limit = interaction.options.getInteger('limit') ?? 5;
  const rows = await store.listUnreviewed(limit);
  if (!rows.length) {
    await interaction.editReply('No unreviewed price checks right now.');
    return;
  }
  await interaction.editReply(rows.map((row) => `- \`${row.submissionId}\` ${row.confidence} confidence, ${row.trustedCompCount} comps`).join('\n'));
}

async function handleAddComp(interaction, { store }) {
  await interaction.deferReply({ ephemeral: true });
  const listing = {
    title: interaction.options.getString('title', true),
    price: interaction.options.getNumber('price', true),
    url: interaction.options.getString('url') ?? '',
    soldDate: interaction.options.getString('sold_date') ?? null,
    description: interaction.options.getString('description') ?? ''
  };
  listing.features = extractListingFeatures(listing);
  const saved = await store.addManualListing(listing);
  await interaction.editReply(`Saved manual sold comp: \`${saved.id}\``);
}

async function handleRefreshComps(interaction, { store }) {
  await interaction.deferReply({ ephemeral: true });
  const id = interaction.options.getString('submission_id', true);
  const detail = await store.getSubmissionDetail(id);
  if (!detail) {
    await interaction.editReply('Submission not found.');
    return;
  }
  await interaction.editReply('Refresh is ready in the pipeline; submit the item again with `/pricecheck` for a fresh run. The original inputs are preserved for explain/review.');
}

async function handleButton(interaction, { store }) {
  const [prefix, label, submissionId] = interaction.customId.split(':');
  if (prefix !== 'review') return;
  await store.saveReviewLabel({
    submissionId,
    reviewerDiscordId: interaction.user.id,
    label,
    reason: '',
    resultId: interaction.message.id,
    scoreAtPrediction: {},
    modelVersion: 'review-card-v1'
  });
  await interaction.reply({ content: `Saved review label: ${label}`, ephemeral: true });
}

function collectImages(interaction) {
  const slots = [
    ['front', 'front'],
    ['back', 'back'],
    ['tag', 'tag']
  ];
  return slots
    .map(([name, role]) => {
      const attachment = interaction.options.getAttachment(name);
      if (!attachment) return null;
      if (!looksLikeImage(attachment)) {
        throw new Error(`${name} must be an image attachment.`);
      }
      return {
        role,
        url: attachment.url,
        filename: attachment.name,
        contentType: attachment.contentType ?? '',
        size: attachment.size
      };
    })
    .filter(Boolean);
}

function looksLikeImage(attachment) {
  if (attachment.contentType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(attachment.name ?? '');
}
