import Redis from 'ioredis';
import type { HotelOffer, QueryOffersInput, SaveOffersInput } from '../domain/types';
import { normalizeName } from '../domain/select-offers';
import { log } from '../logging';

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

export function snapshotKeys(snapshotId: string) {
  if (!/^hotels-[a-f0-9-]+$/i.test(snapshotId)) throw new Error('Invalid snapshot ID');
  const prefix = `hotels:{${snapshotId}}`;
  return { offers: `${prefix}:offers`, prices: `${prefix}:prices`, meta: `${prefix}:meta` };
}

export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  redis.on('error', () => log('warn', 'Redis connection error'));
  return redis;
}

// One script guarantees metadata, price index and offers are read from the same
// snapshot, including if its TTL would elapse between separate Redis commands.
const queryScript = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return redis.error_reply('SNAPSHOT_EXPIRED')
end
local count = tonumber(redis.call('HGET', KEYS[1], 'count'))
if not count or count ~= redis.call('ZCARD', KEYS[2]) or count ~= redis.call('HLEN', KEYS[3]) then
  return redis.error_reply('SNAPSHOT_INCOMPLETE')
end
local names = redis.call('ZRANGE', KEYS[2], ARGV[1], ARGV[2], 'BYSCORE')
local result = {}
for _, name in ipairs(names) do
  local offer = redis.call('HGET', KEYS[3], name)
  if not offer then return redis.error_reply('SNAPSHOT_INCOMPLETE') end
  table.insert(result, offer)
end
return result
`;

export class OfferStore {
  constructor(private readonly redis: Redis) {}

  async save(input: SaveOffersInput): Promise<void> {
    const keys = snapshotKeys(input.snapshotId);
    const transaction = this.redis.multi().del(keys.meta, keys.offers, keys.prices);
    // Replace rather than append: a retried activity is idempotent.
    for (const offer of input.offers) {
      const name = normalizeName(offer.name);
      transaction.hset(keys.offers, name, JSON.stringify(offer));
      transaction.zadd(keys.prices, offer.price, name);
    }
    transaction.hset(keys.meta, 'city', input.city, 'count', String(input.offers.length));
    for (const key of Object.values(keys)) transaction.expire(key, input.ttlSeconds);
    const replies = await transaction.exec();
    if (!replies || replies.some(([error]) => error)) throw new Error('Redis snapshot transaction failed');
  }

  async query(input: QueryOffersInput): Promise<HotelOffer[]> {
    const keys = snapshotKeys(input.snapshotId);
    try {
      const values = await this.redis.eval(
        queryScript, 3, keys.meta, keys.prices, keys.offers,
        input.minPrice ?? '-inf', input.maxPrice ?? '+inf',
      );
      if (!Array.isArray(values)) throw new SnapshotError('Invalid Redis snapshot result');
      return values.map((value: unknown) => {
        if (typeof value !== 'string') throw new SnapshotError('Invalid Redis snapshot entry');
        return JSON.parse(value) as HotelOffer;
      });
    } catch (error) {
      if (error instanceof Error && /SNAPSHOT_(EXPIRED|INCOMPLETE)/.test(error.message)) {
        throw new SnapshotError('Hotel snapshot expired or is incomplete');
      }
      throw error;
    }
  }
}
