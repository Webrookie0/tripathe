import type { SupplierHotel, SupplierName } from '../domain/types';

export const fixtures: Record<SupplierName, SupplierHotel[]> = {
  'Supplier A': [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    { hotelId: 'a3', name: 'City Inn', price: 4200, city: 'delhi', commissionPct: 8 },
    { hotelId: 'a4', name: 'Grand Palace', price: 7500, city: 'delhi', commissionPct: 12 },
    { hotelId: 'a5', name: 'Sea View', price: 6800, city: 'mumbai', commissionPct: 10 },
    { hotelId: 'a6', name: 'Garden Stay', price: 3800, city: 'bengaluru', commissionPct: 9 },
  ],
  'Supplier B': [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Radison', price: 6200, city: 'delhi', commissionPct: 15 },
    { hotelId: 'b3', name: 'Budget Nest', price: 2800, city: 'delhi', commissionPct: 7 },
    { hotelId: 'b4', name: 'Grand Palace', price: 7500, city: 'delhi', commissionPct: 18 },
    { hotelId: 'b5', name: 'Sea View', price: 6500, city: 'mumbai', commissionPct: 14 },
    { hotelId: 'b6', name: 'Metro Lodge', price: 4500, city: 'mumbai', commissionPct: 11 },
  ],
};
