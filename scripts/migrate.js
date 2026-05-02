import { buildStartupDiagnostics, getConfig } from '../src/config.js';
import { createStore } from '../src/storage/store.js';

const config = getConfig();
console.log(`MIGRATE_ENV_DIAGNOSTICS ${JSON.stringify(buildStartupDiagnostics(config))}`);

if (config.storage.driver === 'postgres' && !config.storage.databaseUrl) {
  console.warn('DATABASE_URL is missing. Skipping Postgres migration so the app can still start.');
  process.exit(0);
}

const store = createStore(config.storage);
try {
  await store.init();
  if (config.storage.driver === 'postgres') {
    await store.migrate();
    console.log('Postgres schema migrated.');
  } else {
    console.log('JSON store initialized.');
  }
} catch (error) {
  console.error(`Migration skipped after startup error: ${error.message}`);
  console.error('The app startup has its own fallback path; leaving migration non-fatal for Railway.');
  process.exit(0);
}
