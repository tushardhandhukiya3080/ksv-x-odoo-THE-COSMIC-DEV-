// @vendorbridge/shared — single import surface for web + api.
export * from './enums.js';
export * from './constants.js';
export * from './money.js';
export * from './schemas/auth.js';
export * from './schemas/vendor.js';
export * from './schemas/rfq.js';
export * from './schemas/quotation.js';
export * from './schemas/workflow.js';
export * from './schemas/shipment.js';
export * from './schemas/trade.js';

// Common API response envelope (Spec §8).
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  details?: unknown;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
