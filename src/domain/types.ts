export type SupplierName = 'Supplier A' | 'Supplier B';

export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface HotelOffer {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}

export interface HotelQuery {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface WorkflowInput extends HotelQuery {
  requestId: string;
  snapshotTtlSeconds: number;
}

export interface SaveOffersInput {
  snapshotId: string;
  city: string;
  offers: HotelOffer[];
  ttlSeconds: number;
}

export interface QueryOffersInput {
  snapshotId: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface HotelActivities {
  fetchSupplierA(city: string): Promise<SupplierHotel[]>;
  fetchSupplierB(city: string): Promise<SupplierHotel[]>;
  saveOffers(input: SaveOffersInput): Promise<void>;
  queryOffers(input: QueryOffersInput): Promise<HotelOffer[]>;
}
