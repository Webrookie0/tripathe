import type { HotelQuery } from '../domain/types';
import { HttpError } from './errors';

const invalid = (message: string): never => { throw new HttpError(400, 'INVALID_QUERY', message); };

export function parseCity(value: unknown): string {
  if (typeof value !== 'string') return invalid('city must be supplied exactly once');
  const city = value.trim().toLowerCase();
  if (!city || city.length > 100 || /\p{Cc}/u.test(city)) {
    return invalid('city must be a nonempty name of at most 100 characters');
  }
  return city;
}

function parsePrice(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    return invalid(`${field} must be a nonnegative decimal price with at most two decimal places`);
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price > Number.MAX_SAFE_INTEGER / 100) {
    return invalid(`${field} is outside the supported price range`);
  }
  return price;
}

export function parseHotelQuery(query: Record<string, unknown>): HotelQuery {
  const city = parseCity(query.city);
  const minPrice = parsePrice(query.minPrice, 'minPrice');
  const maxPrice = parsePrice(query.maxPrice, 'maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return invalid('minPrice must be less than or equal to maxPrice');
  }
  return { city, minPrice, maxPrice };
}
