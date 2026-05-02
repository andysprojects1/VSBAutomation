import { getConfig } from '../src/config.js';
import { createStore } from '../src/storage/store.js';

const config = getConfig();
const store = createStore(config.storage);
await store.init();
if (config.storage.driver === 'postgres') {
  await store.migrate();
  console.log('Postgres schema migrated.');
} else {
  console.log('JSON store initialized.');
}
