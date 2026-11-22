import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { ApplicationFailure } from '@temporalio/common';
import { createApp, type AppDependencies } from '../../src/api/app';
import { loadConfig } from '../../src/config';
import { HttpError } from '../../src/api/errors';

async function withApp(dependencies: Partial<AppDependencies>, run: (url: string) => Promise<void>, down = false) {
  const config = loadConfig({ MOCK_SUPPLIER_B_DOWN: String(down) });
  const app = createApp(config, {
    getHotels: async () => [], redisHealth: async () => 'PONG', temporalHealth: async () => undefined,
    ...dependencies,
  });
  let server: Server;
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
  const address = server!.address();
  assert.ok(address && typeof address !== 'string');
  config.supplierBaseUrl = `http://127.0.0.1:${address.port}`;
  try { await run(config.supplierBaseUrl); }
  finally {
    server!.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
}

test('API validates input before orchestration and returns workflow/request headers', async () => {
  let calls = 0;
  await withApp({ getHotels: async (query, requestId, onStart) => {
    calls++;
    assert.equal(query.city, 'delhi');
    assert.equal(query.minPrice, 0);
    assert.equal(requestId, 'test-request');
    onStart('hotels-1234');
    return [{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }];
  } }, async url => {
    const invalid = await fetch(`${url}/api/hotels`);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    const repeated = await fetch(`${url}/api/hotels?city=delhi&city=mumbai`);
    assert.equal(repeated.status, 400);
    const valid = await fetch(`${url}/api/hotels?city=Delhi&minPrice=0`, { headers: { 'x-request-id': 'test-request' } });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('x-workflow-id'), 'hotels-1234');
    assert.equal(valid.headers.get('x-request-id'), 'test-request');
    assert.equal((await valid.json()).length, 1);
  });
});

test('unknown city and mock endpoints return arrays', async () => {
  await withApp({}, async url => {
    const empty = await fetch(`${url}/api/hotels?city=atlantis`);
    assert.deepEqual(await empty.json(), []);
    const supplier = await fetch(`${url}/supplierA/hotels?city=Delhi`);
    const hotels = await supplier.json();
    assert.equal(hotels.length, 4);
    assert.ok(hotels.every((h: { city: string }) => h.city === 'delhi'));
    assert.equal((await fetch(`${url}/does-not-exist`)).status, 404);
  });
});

test('health checks actual supplier endpoints and reports failure without breaking liveness', async () => {
  await withApp({}, async url => {
    assert.equal((await fetch(`${url}/health`)).status, 200);
  });
  await withApp({ redisHealth: async () => { throw new Error('down'); } }, async url => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.dependencies.supplierA.status, 'up');
    assert.equal(body.dependencies.supplierB.status, 'down');
    assert.equal(body.dependencies.redis.status, 'down');
    assert.equal((await fetch(`${url}/live`)).status, 200);
  }, true);
});

test('errors are sanitized and nested supplier errors map to 502', async () => {
  await withApp({ getHotels: async () => { throw new Error('wrapper', { cause: ApplicationFailure.create({ message: 'internal detail', type: 'SUPPLIER_FAILURE' }) }); } }, async url => {
    const response = await fetch(`${url}/api/hotels?city=delhi`);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, 'SUPPLIER_UNAVAILABLE');
    assert.ok(!JSON.stringify(body).includes('internal detail'));
  });
  await withApp({ getHotels: async () => { throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Storage unavailable'); } }, async url => {
    assert.equal((await fetch(`${url}/api/hotels?city=delhi`)).status, 503);
  });
});
