import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { loadConfig } from '../../src/config';
import { createActivities } from '../../src/activities';
import { createRedis, OfferStore, snapshotKeys } from '../../src/redis/store';
import { fixtures } from '../../src/mocks/fixtures';

test('real Temporal workflow calls suppliers concurrently, stores all winners, filters in Redis, and retries failures', { timeout: 120000 }, async () => {
  const env = await TestWorkflowEnvironment.createLocal();
  const redis = createRedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  let down = false;
  let attemptsB = 0;
  let requests = 0;
  const waiting: (() => void)[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const isB = url.pathname === '/supplierB/hotels';
    if (isB) attemptsB++;
    if (isB && down) { res.writeHead(503); res.end(); return; }
    // The first supplier response waits for the second request. Sequential
    // supplier activities would time out, so this verifies concurrency.
    const send = () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(fixtures[isB ? 'Supplier B' : 'Supplier A'].filter(h => h.city === url.searchParams.get('city')))); };
    requests++;
    if (requests < 2 && !down) waiting.push(send);
    else { send(); waiting.splice(0).forEach(fn => fn()); }
  });
  const snapshots: string[] = [];
  try {
    await redis.connect();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const config = loadConfig({ SUPPLIER_BASE_URL: `http://127.0.0.1:${address.port}` });
    const taskQueue = `hotels-test-${randomUUID()}`;
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('../../src/temporal/workflows'),
      activities: createActivities(config, new OfferStore(redis)),
    });
    await worker.runUntil(async () => {
      const run = (city: string, minPrice?: number, maxPrice?: number) => {
        const workflowId = `hotels-${randomUUID()}`;
        snapshots.push(workflowId);
        return env.client.workflow.execute('hotelOffersWorkflow', { taskQueue, workflowId, workflowExecutionTimeout: '45 seconds', args: [{ city, minPrice, maxPrice, requestId: workflowId, snapshotTtlSeconds: 60 }] });
      };
      const result = await run('delhi', 5000, 6000);
      assert.deepEqual(result, [
        { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
        { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
      ]);
      assert.equal(requests, 2);
      assert.equal(await redis.hlen(snapshotKeys(snapshots[0]!).offers), 5);
      assert.deepEqual(await run('atlantis'), []);
      down = true;
      attemptsB = 0;
      await assert.rejects(run('delhi'));
      assert.equal(attemptsB, 3);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (redis.status === 'ready' && snapshots.length) await redis.del(...snapshots.flatMap(id => Object.values(snapshotKeys(id))));
    redis.disconnect();
    await env.teardown();
  }
});
