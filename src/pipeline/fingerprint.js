import { extractYears, includesAny, normalizeText, uniqueTokens } from './text.js';

const KNOWN_TAGS = [
  'anvil', 'brockum', 'changes', 'fruit of the loom', 'giant', 'hanes', 'jerzees',
  'liquid blue', 'screen stars', 'screenstars', 'spring ford', 'stanley desantis', 'tultex', 'wild oats'
];

const BACK_HIT_TERMS = ['back hit', 'double sided', 'two sided', '2 sided', 'front and back', 'back print'];
const SINGLE_STITCH_TERMS = ['single stitch', 'single-stitch', 'single stitched'];
const DOUBLE_STITCH_TERMS = ['double stitch', 'double-stitch', 'double stitched'];
const AUTH_FLAGS = ['reprint', 'modern', 'reproduction', 'fake', 'bootleg', 'tribute'];
const CONDITION_FLAGS = ['holes', 'hole', 'stain', 'stains', 'faded', 'cracking', 'dry rot', 'thin'];

function firstNonEmpty(...values) {
  return values.find((value) => value != null && String(value).trim() !== '') ?? null;
}

function guessSubject(text) {
  const tokens = uniqueTokens(text);
  if (!tokens.length) return null;
  return tokens.slice(0, 4).join(' ');
}

function guessDecade(year) {
  if (!year) return null;
  const numeric = Number.parseInt(year, 10);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.floor(numeric / 10) * 10}s`;
}

function cleanSearchSubject(value) {
  const normalized = normalizeText(value)
    .replace(/\bt\s?shirt\b/g, ' shirt ')
    .replace(/\bscreen\s?stars\b/g, ' screenstars ');
  const noisy = new Set([
    'vintage', 'shirt', 'tee', 'single', 'double', 'stitch', 'stitched',
    'screenstars', 'screen', 'stars', 'tag', 'tags', 'euro', 'tour',
    'rare', 'original', 'authentic', 'mens', 'men', 'women', 'large',
    'medium', 'small', 'xl', 'xxl'
  ]);
  const tokens = normalized.split(' ')
    .filter((token) => token.length > 1)
    .filter((token) => !noisy.has(token));
  const unique = [...new Set(tokens)].slice(0, 8);
  return unique.join(' ') || null;
}

export function buildFingerprint({ submissionId, note, itemNameGuess, images = [], vision = {} }) {
  const text = [itemNameGuess, note, vision.likelyArtist, vision.brandOrSubject, vision.graphicSummary, vision.tourOrAlbum, vision.visibleYear, vision.tagBrand].filter(Boolean).join(' ');
  const normalized = normalizeText(text);
  const years = [...new Set([...(vision.visibleYear ? [String(vision.visibleYear)] : []), ...extractYears(text)])];
  const visibleYear = years[0] ?? null;
  const tagBrand = firstNonEmpty(
    vision.tagBrand,
    KNOWN_TAGS.find((tag) => normalized.includes(normalizeText(tag)))
  );
  const stitchType = firstNonEmpty(
    vision.stitchType,
    includesAny(text, SINGLE_STITCH_TERMS) ? 'single stitch' : null,
    includesAny(text, DOUBLE_STITCH_TERMS) ? 'double stitch' : null
  );
  const hasBackHit = Boolean(vision.hasBackHit ?? includesAny(text, BACK_HIT_TERMS) ?? images.some((image) => image.role === 'back'));
  const cleanedSubject = cleanSearchSubject(firstNonEmpty(itemNameGuess, note, vision.graphicSummary, text));
  const artist = firstNonEmpty(vision.likelyArtist, cleanedSubject, itemNameGuess, guessSubject(note));
  const subject = firstNonEmpty(vision.brandOrSubject, cleanedSubject, artist, guessSubject(text));
  const querySubject = firstNonEmpty(cleanedSubject, subject, artist);

  return {
    submissionId,
    queryName: [querySubject, querySubject?.includes(visibleYear) ? null : visibleYear, 'vintage shirt'].filter(Boolean).join(' '),
    artist,
    querySubject,
    submittedTitle: itemNameGuess || null,
    brandOrSubject: subject,
    eraGuess: firstNonEmpty(vision.eraGuess, visibleYear),
    decadeGuess: firstNonEmpty(vision.decadeGuess, guessDecade(visibleYear)),
    tourOrAlbum: firstNonEmpty(vision.tourOrAlbum, null),
    visibleYear,
    tagBrand,
    stitchType,
    hasBackHit,
    graphicFamilyGuess: firstNonEmpty(vision.graphicFamilyGuess, vision.graphicSummary, subject),
    conditionFlags: [...new Set([...(vision.conditionFlags ?? []), ...CONDITION_FLAGS.filter((flag) => normalized.includes(flag))])],
    authenticityFlags: [...new Set([...(vision.authenticityFlags ?? []), ...AUTH_FLAGS.filter((flag) => normalized.includes(flag))])],
    exclusionTerms: ['reprint', 'modern', 'tribute', 'reproduction'],
    confidence: {
      artist: vision.confidence?.artist ?? (artist ? 0.55 : 0.1),
      visibleYear: vision.confidence?.visibleYear ?? (visibleYear ? 0.8 : 0.1),
      tagBrand: vision.confidence?.tagBrand ?? (tagBrand ? 0.65 : 0.1),
      stitchType: vision.confidence?.stitchType ?? (stitchType ? 0.55 : 0.1),
      graphicFamily: vision.confidence?.graphicFamily ?? (vision.graphicSummary ? 0.55 : 0.2)
    },
    guessedFields: {
      artist: !vision.likelyArtist,
      visibleYear: !vision.visibleYear && Boolean(visibleYear),
      tagBrand: !vision.tagBrand && Boolean(tagBrand),
      stitchType: !vision.stitchType && Boolean(stitchType)
    },
    rawVisionNotes: vision.notes ?? '',
    imageRoles: images.map((image) => image.role)
  };
}
