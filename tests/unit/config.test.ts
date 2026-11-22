import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../../src/config';

test('defaults work and unrelated PORT values are ignored', () => {
  const config = loadConfig({ PORT: '8000' });
  assert.equal(config.port, 3000);
  assert.equal(config.supplierBDown, false);
  assert.equal(config.snapshotTtlSeconds, 600);
});

test('configuration rejects invalid ranges, flags and protocols', () => {
  for (const env of [
    { HOTEL_PORT: '0' }, { SUPPLIER_TIMEOUT_MS: '20000' }, { SNAPSHOT_TTL_SECONDS: '1' },
    { MOCK_SUPPLIER_B_DOWN: 'yes' }, { REDIS_URL: 'http://localhost' },
    { SUPPLIER_BASE_URL: 'file:///tmp' }, { TEMPORAL_TASK_QUEUE: '' },
  ]) assert.throws(() => loadConfig(env));
});
