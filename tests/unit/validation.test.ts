import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHotelQuery } from '../../src/api/validation';
import { HttpError } from '../../src/api/errors';

test('normalizes city and supports zero, decimal and one-sided bounds', () => {
  assert.deepEqual(parseHotelQuery({ city: ' Delhi ', minPrice: '0', maxPrice: '5340.50' }), { city: 'delhi', minPrice: 0, maxPrice: 5340.5 });
  assert.equal(parseHotelQuery({ city: 'mumbai', minPrice: '5000' }).maxPrice, undefined);
  assert.equal(parseHotelQuery({ city: 'mumbai', maxPrice: '5000' }).minPrice, undefined);
  assert.equal(parseHotelQuery({ city: 'atlantis' }).city, 'atlantis');
});

for (const query of [
  {}, { city: '' }, { city: '   ' }, { city: ['delhi', 'mumbai'] },
  { city: 'delhi', minPrice: '-1' }, { city: 'delhi', minPrice: 'abc' },
  { city: 'delhi', maxPrice: 'Infinity' }, { city: 'delhi', maxPrice: 'NaN' },
  { city: 'delhi', minPrice: '' }, { city: 'delhi', minPrice: ' 5 ' },
  { city: 'delhi', minPrice: '1e3' }, { city: 'delhi', minPrice: '1.001' },
  { city: 'delhi', minPrice: ['1', '2'] }, { city: 'delhi', maxPrice: {} },
  { city: 'delhi', minPrice: '6000', maxPrice: '5000' },
  { city: 'delhi', maxPrice: '9999999999999999999999999999' },
]) {
  test(`rejects invalid query ${JSON.stringify(query)}`, () => {
    assert.throws(() => parseHotelQuery(query), (error: unknown) => error instanceof HttpError && error.status === 400);
  });
}

test('equal bounds are permitted', () => {
  const query = parseHotelQuery({ city: 'delhi', minPrice: '5340', maxPrice: '5340' });
  assert.equal(query.minPrice, query.maxPrice);
});
