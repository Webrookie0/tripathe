import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createRedis, OfferStore, snapshotKeys, SnapshotError } from '../../src/redis/store';
import type { HotelOffer } from '../../src/domain/types';

test('real Redis stores full snapshots, filters inclusively, isolates requests and detects expiry', async () => {
  const redis = createRedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  await redis.connect();
  const store = new OfferStore(redis);
  const a = `hotels-${randomUUID()}`;
  const b = `hotels-${randomUUID()}`;
  const empty = `hotels-${randomUUID()}`;
  const offers: HotelOffer[] = [
    { name: 'Zero', price: 0, supplier: 'Supplier A', commissionPct: 1 },
    { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    { name: 'Alpha', price: 5900, supplier: 'Supplier A', commissionPct: 10 },
    { name: 'Premium', price: 8000.5, supplier: 'Supplier B', commissionPct: 10 },
  ];
  try {
    await Promise.all([
      store.save({ snapshotId: a, city: 'delhi', offers, ttlSeconds: 60 }),
      store.save({ snapshotId: b, city: 'delhi', offers: [offers[0]!], ttlSeconds: 60 }),
      store.save({ snapshotId: empty, city: 'atlantis', offers: [], ttlSeconds: 60 }),
    ]);
    assert.equal(await redis.hlen(snapshotKeys(a).offers), 5);
    assert.ok(await redis.ttl(snapshotKeys(a).meta) > 0);
    assert.deepEqual((await store.query({ snapshotId: a, minPrice: 5340, maxPrice: 5900 })).map(h => h.name), ['Holtin', 'Alpha', 'Radison']);
    assert.equal((await store.query({ snapshotId: a, minPrice: 5900, maxPrice: 5900 })).length, 2);
    assert.equal((await store.query({ snapshotId: a, maxPrice: 0 })).length, 1);
    assert.equal((await store.query({ snapshotId: a, minPrice: 8000.5 })).length, 1);
    assert.deepEqual(await store.query({ snapshotId: a, minPrice: 9000 }), []);
    assert.equal((await store.query({ snapshotId: a })).length, 5);
    assert.equal((await store.query({ snapshotId: b })).length, 1);
    assert.deepEqual(await store.query({ snapshotId: empty }), []);
    // Losing an index must be reported as corruption, not as an empty range.
    await redis.del(snapshotKeys(b).prices);
    await assert.rejects(store.query({ snapshotId: b }), SnapshotError);
    // Retry writes replace old entries rather than leaving stale index members.
    await store.save({ snapshotId: b, city: 'delhi', offers: [offers[1]!], ttlSeconds: 60 });
    assert.deepEqual((await store.query({ snapshotId: b })).map(h => h.name), ['Holtin']);
    for (const key of Object.values(snapshotKeys(b))) await redis.pexpire(key, 30);
    await delay(60);
    await assert.rejects(store.query({ snapshotId: b }), SnapshotError);
  } finally {
    await redis.del(...[a, b, empty].flatMap(id => Object.values(snapshotKeys(id))));
    redis.disconnect();
  }
});
