import type { SupplierHotel, SupplierName } from '../domain/types';

export class SupplierError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'SupplierError';
  }
}

export function validateSupplierPayload(payload: unknown, city: string): SupplierHotel[] {
  if (!Array.isArray(payload)) throw new SupplierError('Supplier response must be an array', false);
  for (const item of payload) {
    if (
      !item || typeof item !== 'object' ||
      typeof item.hotelId !== 'string' || !item.hotelId.trim() ||
      typeof item.name !== 'string' || !item.name.trim() ||
      typeof item.city !== 'string' || item.city.trim().toLowerCase() !== city ||
      typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0 ||
      item.price > Number.MAX_SAFE_INTEGER / 100 ||
      typeof item.commissionPct !== 'number' || !Number.isFinite(item.commissionPct) ||
      item.commissionPct < 0 || item.commissionPct > 100
    ) {
      throw new SupplierError('Supplier returned an invalid hotel or a hotel for the wrong city', false);
    }
  }
  return payload as SupplierHotel[];
}

export async function fetchSupplierHotels(
  supplier: SupplierName,
  city: string,
  baseUrl: string,
  timeoutMs: number,
  requestId?: string,
): Promise<SupplierHotel[]> {
  const path = supplier === 'Supplier A' ? '/supplierA/hotels' : '/supplierB/hotels';
  const url = new URL(path, baseUrl);
  url.searchParams.set('city', city);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: requestId ? { 'x-request-id': requestId } : {},
    });
    if (!response.ok) {
      // Transport/server problems and throttling can recover; other 4xx cannot.
      throw new SupplierError(`${supplier} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429 || response.status === 408);
    }
    let payload: unknown;
    try { payload = await response.json(); }
    catch (error) {
      if (error instanceof SyntaxError) throw new SupplierError(`${supplier} returned malformed JSON`, false);
      throw error;
    }
    return validateSupplierPayload(payload, city);
  } catch (error) {
    if (error instanceof SupplierError) throw error;
    throw new SupplierError(`${supplier} request failed or timed out`, true);
  }
}
