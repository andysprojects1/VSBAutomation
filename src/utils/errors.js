export function describeError(error) {
  if (!error) return 'Unknown error';
  const parts = [];
  if (error.name) parts.push(`name=${error.name}`);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.status) parts.push(`status=${error.status}`);
  if (error.method) parts.push(`method=${error.method}`);
  if (error.url) parts.push(`url=${sanitizeUrl(error.url)}`);
  if (error.message) parts.push(`message=${error.message}`);
  if (error.rawError?.message) parts.push(`raw=${error.rawError.message}`);
  if (Array.isArray(error.rawError?.errors)) parts.push(`errors=${JSON.stringify(error.rawError.errors)}`);
  return parts.join(' | ') || String(error);
}

function sanitizeUrl(url) {
  return String(url).replace(/\/bot[.\w-]+/g, '/bot<redacted>');
}
