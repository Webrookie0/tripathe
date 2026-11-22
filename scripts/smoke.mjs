import assert from 'node:assert/strict';

const baseUrl = process.env.HOTEL_API_URL ?? 'http://127.0.0.1:3000';
const check = async (path, expectedStatus = 200) => {
  const response = await fetch(new URL(path, baseUrl), { signal: AbortSignal.timeout(55000) });
  assert.equal(response.status, expectedStatus, `${path}: unexpected HTTP status`);
  return { body: await response.json(), response };
};

const health = await check('/health');
assert.equal(health.body.status, 'ok');
const all = await check('/api/hotels?city=delhi');
assert.equal(all.body.length, 5);
assert.equal(new Set(all.body.map(h => h.name.trim().toLowerCase())).size, 5);
assert.ok(all.response.headers.get('x-workflow-id'));
const filtered = await check('/api/hotels?city=delhi&minPrice=5000&maxPrice=6000');
assert.deepEqual(filtered.body, [
  { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
  { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
]);
assert.deepEqual((await check('/api/hotels?city=atlantis')).body, []);
assert.equal((await check('/api/hotels?city=delhi&maxPrice=4200')).body.length, 2);
assert.equal((await check('/api/hotels?city=delhi&minPrice=7500')).body.length, 1);
assert.equal((await check('/api/hotels?city=delhi&minPrice=5340&maxPrice=5340')).body.length, 1);
assert.equal((await check('/api/hotels?city=delhi&minPrice=0&maxPrice=0')).body.length, 0);
await check('/api/hotels?city=delhi&minPrice=6000&maxPrice=5000', 400);
await check('/api/hotels', 400);
console.log('Hotel API smoke checks passed (real Temporal workflows and Redis filtering).');
