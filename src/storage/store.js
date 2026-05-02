import { JsonStore } from './jsonStore.js';
import { PostgresStore } from './postgresStore.js';

export function createStore(config) {
  if (config.driver === 'postgres') {
    return new PostgresStore(config.databaseUrl);
  }
  return new JsonStore(config.jsonPath);
}
