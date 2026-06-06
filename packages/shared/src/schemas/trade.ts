import { z } from 'zod';

export const tradeProfileSchema = z.object({
  type: z.enum(['BUYER', 'SUPPLIER', 'BOTH']),
  country: z.string().min(2).max(80),
  incotermsDefault: z.string().max(20).optional(),
  currencies: z.array(z.string().length(3)).min(1),
});
export type TradeProfileInput = z.infer<typeof tradeProfileSchema>;

export const tradeConnectionSchema = z.object({
  toOrgId: z.string(),
  relationship: z.enum(['B2B', 'P2P']),
});
export type TradeConnectionInput = z.infer<typeof tradeConnectionSchema>;

export const respondConnectionSchema = z.object({
  accept: z.boolean(),
});
export type RespondConnectionInput = z.infer<typeof respondConnectionSchema>;

export const listingSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  priceFrom: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional().default('USD'),
  moq: z.number().int().positive().optional(),
  hsCode: z.string().max(20).optional(),
});
export type ListingInput = z.infer<typeof listingSchema>;
