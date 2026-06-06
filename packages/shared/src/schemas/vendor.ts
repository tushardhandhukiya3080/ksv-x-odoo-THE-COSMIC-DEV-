import { z } from 'zod';
import { VendorStatus } from '../enums.js';
import { GSTIN_REGEX } from '../constants.js';

export const createVendorSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  address: z.string().max(400).optional(),
  gstin: z
    .string()
    .regex(GSTIN_REGEX, 'Invalid GSTIN (expected 15-char format)')
    .optional()
    .or(z.literal('')),
  categoryId: z.string().optional(),
  whatsappOptIn: z.boolean().optional().default(true),
  status: z.nativeEnum(VendorStatus).optional().default(VendorStatus.ACTIVE),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = createVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const createVendorCategorySchema = z.object({
  name: z.string().min(2).max(80),
});
export type CreateVendorCategoryInput = z.infer<typeof createVendorCategorySchema>;
