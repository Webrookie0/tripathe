import { ApplicationFailure } from '@temporalio/common';
import { activityInfo, log } from '@temporalio/activity';
import type { Config } from '../config';
import type { HotelActivities, SupplierName } from '../domain/types';
import { fetchSupplierHotels, SupplierError } from './suppliers';
import { OfferStore, SnapshotError } from '../redis/store';

export function createActivities(config: Config, store: OfferStore): HotelActivities {
  const supplier = async (name: SupplierName, city: string) => {
    const info = activityInfo();
    const started = Date.now();
    log.info('Fetching supplier hotels', { supplier: name, city, attempt: info.attempt });
    try {
      const hotels = await fetchSupplierHotels(name, city, config.supplierBaseUrl, config.supplierTimeoutMs, info.workflowExecution.workflowId);
      log.info('Supplier hotels received', { supplier: name, city, count: hotels.length, durationMs: Date.now() - started });
      return hotels;
    } catch (error) {
      log.error('Supplier activity failed', { supplier: name, city, attempt: info.attempt, durationMs: Date.now() - started });
      const retryable = error instanceof SupplierError && error.retryable;
      throw ApplicationFailure.create({
        message: `${name} is unavailable or returned an invalid response`,
        type: 'SUPPLIER_FAILURE',
        nonRetryable: !retryable,
        cause: error instanceof Error ? error : undefined,
      });
    }
  };
  return {
    fetchSupplierA: (city) => supplier('Supplier A', city),
    fetchSupplierB: (city) => supplier('Supplier B', city),
    saveOffers: async (input) => {
      try {
        await store.save(input);
        log.info('Stored deduplicated offers', { snapshotId: input.snapshotId, city: input.city, count: input.offers.length });
      } catch (error) {
        log.error('Redis save activity failed', { snapshotId: input.snapshotId });
        throw ApplicationFailure.create({ message: 'Unable to persist hotel offers', type: 'REDIS_FAILURE', cause: error instanceof Error ? error : undefined });
      }
    },
    queryOffers: async (input) => {
      try {
        const offers = await store.query(input);
        log.info('Queried Redis price range', { snapshotId: input.snapshotId, count: offers.length, minPrice: input.minPrice, maxPrice: input.maxPrice });
        return offers;
      } catch (error) {
        log.error('Redis query activity failed', { snapshotId: input.snapshotId });
        throw ApplicationFailure.create({
          message: 'Unable to query hotel offers', type: 'REDIS_FAILURE',
          nonRetryable: error instanceof SnapshotError,
          cause: error instanceof Error ? error : undefined,
        });
      }
    },
  };
}
