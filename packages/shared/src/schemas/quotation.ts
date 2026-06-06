import { z } from 'zod';

export const quotationItemSchema = z.object({
  rfqItemId: z.string(),
  unitPrice: z.number().nonnegative('Price must be ≥ 0'),
  quantity: z.number().int().positive(),
  taxRate: z.number().min(0).max(100).optional(),
});
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;

/** Vendor portal: create/save a draft quotation against an invitation token. */
export const createQuotationSchema = z.object({
  token: z.string().min(10),
  deliveryDays: z.number().int().positive(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  currency: z.string().length(3).optional().default('INR'),
  items: z.array(quotationItemSchema).min(1),
});
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z.object({
  deliveryDays: z.number().int().positive().optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(quotationItemSchema).min(1).optional(),
});
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

// ── AI analysis output contract (Spec §7.1) — validated before storing ──
export const aiRankingSchema = z.object({
  quotationId: z.string(),
  score: z.number(),
  rationale: z.string(),
});

export const aiRiskFlagSchema = z.object({
  quotationId: z.string(),
  type: z.string(),
  detail: z.string(),
});

export const aiAnalysisSchema = z.object({
  recommendedQuotationId: z.string().nullable(),
  summary: z.string(),
  ranking: z.array(aiRankingSchema),
  riskFlags: z.array(aiRiskFlagSchema),
});
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
