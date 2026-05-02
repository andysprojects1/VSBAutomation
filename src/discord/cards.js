import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { formatMoney } from '../utils/money.js';

export function buildResultMessage(result) {
  const { submission, fingerprint, matches, priceSnapshot } = result;
  const topMatches = matches
    .filter((match) => ['exact_match', 'same_family_different_variant', 'uncertain'].includes(match.finalLabel))
    .slice(0, 3);
  const title = fingerprint.queryName || fingerprint.artist || 'Vintage tee';
  const estimate = priceSnapshot.bestEstimate == null
    ? 'Not enough trusted sold comps'
    : `${formatMoney(priceSnapshot.bestEstimate, priceSnapshot.currency)} (${formatMoney(priceSnapshot.lowRange, priceSnapshot.currency)}-${formatMoney(priceSnapshot.highRange, priceSnapshot.currency)})`;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setDescription(`Submission \`${submission.id}\``)
    .addFields(
      { name: 'Estimate', value: estimate, inline: false },
      { name: 'Confidence', value: priceSnapshot.confidence, inline: true },
      { name: 'Trusted comps', value: String(priceSnapshot.trustedCompCount), inline: true },
      { name: 'Submitted input', value: summarizeSubmissionInput(submission), inline: false },
      { name: 'Likely details', value: summarizeFingerprint(fingerprint), inline: false },
      { name: 'Notes', value: priceSnapshot.notes.join('\n').slice(0, 1000) || 'No pricing notes.', inline: false }
    )
    .setTimestamp(new Date());

  if (priceSnapshot.trustedCompCount === 0) {
    embed.addFields({
      name: 'Next try',
      value: 'Run `/pricecheck` again with a note like artist/band, visible year, tag brand, tour/album, front text, or back text.',
      inline: false
    });
  }

  const mainImage = result.submissionImages?.find((image) => image.role === 'front') ?? result.inputImages?.find((image) => image.role === 'front');
  if (mainImage?.url) embed.setImage(mainImage.url);

  if (topMatches.length) {
    embed.addFields({
      name: 'Top comps',
      value: topMatches.map((match, index) => {
        const listing = match.listing;
        const price = formatMoney(listing.price, listing.currency);
        const link = listing.url ? `[${listing.title.slice(0, 60)}](${listing.url})` : listing.title.slice(0, 80);
        return `${index + 1}. ${price} - ${link} (${match.finalLabel.replaceAll('_', ' ')})`;
      }).join('\n').slice(0, 1000),
      inline: false
    });
  }

  if (!topMatches.length && result.soldSearchDiagnostics?.length) {
    const manualUrl = result.soldSearchDiagnostics.find((item) => item.soldSearchUrl)?.soldSearchUrl;
    if (manualUrl) {
      embed.addFields({
        name: 'Manual sold search',
        value: `[Open the eBay sold search the bot tried](${manualUrl})`,
        inline: false
      });
    }
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`review:yes:${submission.id}`).setLabel('Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review:no:${submission.id}`).setLabel('No').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`review:variant:${submission.id}`).setLabel('Variant').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`review:reprint:${submission.id}`).setLabel('Reprint').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`review:unclear:${submission.id}`).setLabel('Unclear').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [buttons] };
}

export function buildExplainText(detail) {
  if (!detail) return 'Submission not found.';
  const lines = [
    `Submission: ${detail.submission.id}`,
    `Status: ${detail.submission.status}`,
    '',
    'Fingerprint:',
    codeBlock(JSON.stringify(detail.fingerprint, null, 2).slice(0, 1500)),
    'Queries:',
    ...detail.queries.slice(0, 8).map((query) => `- ${query.queryType}: ${query.queryText}`),
    '',
    'Pricing:',
    detail.priceSnapshot
      ? `${formatMoney(detail.priceSnapshot.bestEstimate, detail.priceSnapshot.currency)} (${detail.priceSnapshot.confidence}, ${detail.priceSnapshot.trustedCompCount} trusted comps)`
      : 'No price snapshot.',
    '',
    'Top match reasons:',
    ...detail.matches.slice(0, 5).map((match) => `- ${match.finalLabel}: ${match.listing?.title ?? match.listingId} | ${match.reasons?.slice(0, 3).join('; ')}`)
  ];
  return lines.join('\n').slice(0, 1900);
}

function summarizeFingerprint(fingerprint) {
  const parts = [
    fingerprint.artist && `Artist/subject: ${fingerprint.artist}`,
    fingerprint.visibleYear && `Year: ${fingerprint.visibleYear}`,
    fingerprint.tagBrand && `Tag: ${fingerprint.tagBrand}`,
    fingerprint.stitchType && `Stitch: ${fingerprint.stitchType}`,
    fingerprint.hasBackHit ? 'Back hit: yes' : null,
    fingerprint.authenticityFlags?.length ? `Flags: ${fingerprint.authenticityFlags.join(', ')}` : null
  ].filter(Boolean);
  return parts.join('\n') || 'Not enough detail extracted.';
}

function summarizeSubmissionInput(submission) {
  const parts = [
    submission.itemNameGuess ? `Guess: ${submission.itemNameGuess}` : null,
    submission.rawNote ? `Note: ${submission.rawNote}` : null
  ].filter(Boolean);
  return parts.join('\n').slice(0, 1000) || 'No note or guess received.';
}

function codeBlock(value) {
  return `\`\`\`json\n${value}\n\`\`\``;
}
