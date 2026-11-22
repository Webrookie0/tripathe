import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectBestOffers } from '../../src/domain/select-offers';
import { fixtures } from '../../src/mocks/fixtures';
import type { SupplierHotel } from '../../src/domain/types';

const hotel = (name: string, price: number, commissionPct = 10): SupplierHotel => ({ hotelId: name, name, price, city: 'delhi', commissionPct });

test('chooses cheaper overlapping offers and preserves winning commission', () => {
  const result = selectBestOffers(fixtures['Supplier A'].filter(h => h.city === 'delhi'), fixtures['Supplier B'].filter(h => h.city === 'delhi'));
  assert.equal(result.length, 5);
  assert.deepEqual(result.find(h => h.name === 'Holtin'), { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 });
  assert.deepEqual(result.find(h => h.name === 'Radison'), { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 });
  assert.ok(result.some(h => h.name === 'City Inn'));
  assert.ok(result.some(h => h.name === 'Budget Nest'));
  assert.equal(result.find(h => h.name === 'Grand Palace')?.supplier, 'Supplier A');
});

test('normalizes names, dedupes within each supplier, and retains a zero price', () => {
  assert.deepEqual(selectBestOffers([hotel(' Holtin ', 6000), hotel('HOLTIN', 5500)], [hotel('holtin', 0, 20)]), [
    { name: 'holtin', price: 0, supplier: 'Supplier B', commissionPct: 20 },
  ]);
});

test('ties choose A without changing input arrays', () => {
  const a = [hotel('Holtin', 5000)];
  const b = [hotel('Holtin', 5000, 20)];
  const before = JSON.stringify([a, b]);
  assert.equal(selectBestOffers(a, b)[0]?.supplier, 'Supplier A');
  assert.equal(JSON.stringify([a, b]), before);
});

test('empty inputs produce an empty result and one supplier can contain all hotels', () => {
  assert.deepEqual(selectBestOffers([], []), []);
  assert.equal(selectBestOffers([], [hotel('Single', 1500)]).length, 1);
});
