import { randomBytes } from 'node:crypto';

export function createId(prefix) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function createShortId(prefix) {
  return `${prefix}_${randomBytes(5).toString('hex')}`;
}
