function pushQuery(queries, seen, query) {
  const cleaned = query.queryText.replace(/\s+/g, ' ').trim();
  if (!cleaned || seen.has(cleaned.toLowerCase())) return;
  seen.add(cleaned.toLowerCase());
  queries.push({ ...query, queryText: cleaned });
}

function confident(fingerprint, field, min = 0.45) {
  return (fingerprint.confidence?.[field] ?? 0) >= min;
}

function withYear(subject, year) {
  if (!year) return subject;
  return String(subject).includes(String(year)) ? subject : `${subject} ${year}`;
}

export function generateQueries(fingerprint) {
  const queries = [];
  const seen = new Set();
  const artist = fingerprint.querySubject || fingerprint.artist || fingerprint.brandOrSubject || '';
  const base = [artist, 'vintage shirt'].filter(Boolean).join(' ');

  if (fingerprint.submittedTitle) {
    pushQuery(queries, seen, {
      queryType: 'submitted_title',
      priority: 5,
      queryText: fingerprint.submittedTitle,
      fieldsUsed: ['submittedTitle'],
      debugNotes: 'Original user-provided listing name preserved as a high-specificity query.'
    });
  }

  pushQuery(queries, seen, {
    queryType: 'broad',
    priority: 10,
    queryText: base,
    fieldsUsed: ['artist'],
    debugNotes: 'Broad query keeps recall high.'
  });

  if (fingerprint.tourOrAlbum && confident(fingerprint, 'graphicFamily', 0.35)) {
    pushQuery(queries, seen, {
      queryType: 'narrow_exact',
      priority: 20,
      queryText: `${artist} ${fingerprint.tourOrAlbum} vintage shirt`,
      fieldsUsed: ['artist', 'tourOrAlbum'],
      debugNotes: 'Tour or album field was confident enough to include.'
    });
  }

  if (fingerprint.visibleYear && confident(fingerprint, 'visibleYear', 0.55)) {
    pushQuery(queries, seen, {
      queryType: 'year_specific',
      priority: 30,
      queryText: `${withYear(artist, fingerprint.visibleYear)} vintage shirt`,
      fieldsUsed: ['artist', 'visibleYear'],
      debugNotes: 'Visible year included because confidence is strong.'
    });
  }

  if (fingerprint.visibleYear) {
    pushQuery(queries, seen, {
      queryType: 'subject_year',
      priority: 35,
      queryText: withYear(artist, fingerprint.visibleYear),
      fieldsUsed: ['querySubject', 'visibleYear'],
      debugNotes: 'Cleaner subject/year query for completed-item APIs and sold-search pages.'
    });
  }

  if (fingerprint.tagBrand && confident(fingerprint, 'tagBrand', 0.45)) {
    pushQuery(queries, seen, {
      queryType: 'tag_specific',
      priority: 40,
      queryText: `${artist} ${fingerprint.tagBrand} vintage shirt`,
      fieldsUsed: ['artist', 'tagBrand'],
      debugNotes: 'Tag query helps separate originals from reprints.'
    });
  }

  if (fingerprint.hasBackHit) {
    pushQuery(queries, seen, {
      queryType: 'back_hit',
      priority: 50,
      queryText: `${artist} double sided vintage shirt`,
      fieldsUsed: ['artist', 'hasBackHit'],
      debugNotes: 'Back-hit query included because the submission has or implies a back image.'
    });
  }

  if (fingerprint.graphicFamilyGuess && confident(fingerprint, 'graphicFamily', 0.45)) {
    pushQuery(queries, seen, {
      queryType: 'variant_aware',
      priority: 60,
      queryText: `${artist} ${fingerprint.graphicFamilyGuess} shirt`,
      fieldsUsed: ['artist', 'graphicFamilyGuess'],
      debugNotes: 'Graphic-family terms included as a variant-aware query.'
    });
  }

  if (base) {
    pushQuery(queries, seen, {
      queryType: 'exclusion_heavy',
      priority: 70,
      queryText: `${base} -reprint -modern -tribute`,
      fieldsUsed: ['artist', 'exclusionTerms'],
      debugNotes: 'Exclusion-heavy query for cleaner eBay retrieval where supported.'
    });
  }

  return queries;
}
