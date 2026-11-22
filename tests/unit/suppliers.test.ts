import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchSupplierHotels, SupplierError, validateSupplierPayload } from '../../src/activities/suppliers';
import { fixtures } from '../../src/mocks/fixtures';

const delhi = fixtures['Supplier A'].filter(h => h.city === 'delhi');

test('validates supplier payloads and rejects corrupt or cross-city hotels', () => {
  assert.deepEqual(validateSupplierPayload(delhi, 'delhi'), delhi);
  assert.deepEqual(validateSupplierPayload([], 'delhi'), []);
  for (const payload of [null, {}, [null], [{ ...delhi[0], price: -1 }], [{ ...delhi[0], price: NaN }], [{ ...delhi[0], commissionPct: 101 }], [{ ...delhi[0], city: 'mumbai' }], [{ ...delhi[0], name: ' ' }]]) {
    assert.throws(() => validateSupplierPayload(payload, 'delhi'), (e: unknown) => e instanceof SupplierError && !e.retryable);
  }
});

test('supplier client sets city/headers, classifies HTTP failures, rejects bad JSON and honors abort', async t => {
  let mode: 'ok' | 'down' | 'client' | 'throttled' | 'json' | 'slow' = 'ok';
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/supplierA/hotels');
    assert.equal(url.searchParams.get('city'), 'delhi');
    assert.equal(new Headers(init?.headers).get('x-request-id'), 'request-1');
    if (mode === 'slow') {
      const signal = init?.signal;
      assert.ok(signal);
      return new Promise<Response>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Missing timeout cancellation')), 1000);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
    }
    const status = mode === 'down' ? 503 : mode === 'client' ? 404 : mode === 'throttled' ? 429 : 200;
    return new Response(mode === 'json' ? '{broken' : JSON.stringify(delhi), { status, headers: { 'content-type': 'application/json' } });
  });
  const call = (timeout = 1000) => fetchSupplierHotels('Supplier A', 'delhi', 'http://supplier.test', timeout, 'request-1');
  assert.deepEqual(await call(), delhi);
  mode = 'down';
  await assert.rejects(call(), (e: unknown) => e instanceof SupplierError && e.retryable);
  mode = 'client';
  await assert.rejects(call(), (e: unknown) => e instanceof SupplierError && !e.retryable);
  mode = 'throttled';
  await assert.rejects(call(), (e: unknown) => e instanceof SupplierError && e.retryable);
  mode = 'json';
  await assert.rejects(call(), (e: unknown) => e instanceof SupplierError && !e.retryable);
  mode = 'slow';
  await assert.rejects(call(50), (e: unknown) => e instanceof SupplierError && e.retryable);
});
