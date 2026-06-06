import { z } from 'zod';
import { ApprovalStatus } from '../enums.js';

// ── Approvals (Spec §6.7) ──
export const createApprovalSchema = z.object({
  subjectType: z.enum(['QUOTATION', 'PO']),
  subjectId: z.string(),
  approverIds: z.array(z.string()).min(1, 'At least one approver is required'),
});
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
  remarks: z.string().max(1000).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

// ── Purchase order (Spec §6.8) ──
export const createPoSchema = z.object({
  quotationId: z.string(),
});
export type CreatePoInput = z.infer<typeof createPoSchema>;

// ── Invoice (Spec §6.8) ──
export const createInvoiceSchema = z.object({
  poId: z.string(),
  dueInDays: z.number().int().positive().max(365).optional().default(30),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
