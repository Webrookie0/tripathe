import { log, proxyActivities, workflowInfo } from '@temporalio/workflow';
import type { HotelActivities, HotelOffer, WorkflowInput } from '../domain/types';
import { selectBestOffers } from '../domain/select-offers';

const supplierActivities = proxyActivities<Pick<HotelActivities, 'fetchSupplierA' | 'fetchSupplierB'>>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '25 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumAttempts: 3 },
});
const redisActivities = proxyActivities<Pick<HotelActivities, 'saveOffers' | 'queryOffers'>>({
  startToCloseTimeout: '5 seconds',
  scheduleToCloseTimeout: '10 seconds',
  retry: { initialInterval: '500 milliseconds', backoffCoefficient: 2, maximumAttempts: 3 },
});

export async function hotelOffersWorkflow(input: WorkflowInput): Promise<HotelOffer[]> {
  const snapshotId = workflowInfo().workflowId;
  log.info('Hotel comparison started', { city: input.city, requestId: input.requestId });
  try {
    const [a, b] = await Promise.all([
      supplierActivities.fetchSupplierA(input.city),
      supplierActivities.fetchSupplierB(input.city),
    ]);
    const offers = selectBestOffers(a, b);
    await redisActivities.saveOffers({ snapshotId, city: input.city, offers, ttlSeconds: input.snapshotTtlSeconds });
    const result = await redisActivities.queryOffers({ snapshotId, minPrice: input.minPrice, maxPrice: input.maxPrice });
    log.info('Hotel comparison completed', { city: input.city, uniqueHotels: offers.length, returnedHotels: result.length });
    return result;
  } catch (error) {
    log.error('Hotel comparison failed', { city: input.city, requestId: input.requestId });
    throw error;
  }
}
