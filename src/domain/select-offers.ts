import type { HotelOffer, SupplierHotel, SupplierName } from './types';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Pure, deterministic logic: safe to run inside a Temporal workflow.
export function selectBestOffers(a: SupplierHotel[], b: SupplierHotel[]): HotelOffer[] {
  const winners = new Map<string, HotelOffer>();
  const add = (hotels: SupplierHotel[], supplier: SupplierName) => {
    for (const hotel of hotels) {
      const key = normalizeName(hotel.name);
      const current = winners.get(key);
      if (!current || hotel.price < current.price) {
        winners.set(key, {
          name: hotel.name.trim(),
          price: hotel.price,
          supplier,
          commissionPct: hotel.commissionPct,
        });
      }
    }
  };
  // Equal prices retain the first offer; A wins cross-supplier ties.
  add(a, 'Supplier A');
  add(b, 'Supplier B');
  return [...winners.values()];
}
