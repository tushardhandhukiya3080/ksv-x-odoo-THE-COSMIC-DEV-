import { z } from 'zod';

export const rfqItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  quantity: z.number().int().positive(),
  unit: z.string().min(1).max(20),
});
export type RfqItemInput = z.infer<typeof rfqItemSchema>;

export const createRfqSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  deadline: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: 'Deadline must be in the future',
  }),
  items: z.array(rfqItemSchema).min(1, 'At least one line item is required'),
});
export type CreateRfqInput = z.infer<typeof createRfqSchema>;

export const updateRfqSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  deadline: z.coerce.date().optional(),
});
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;

export const inviteVendorsSchema = z.object({
  vendorIds: z.array(z.string()).min(1, 'Select at least one vendor'),
});
export type InviteVendorsInput = z.infer<typeof inviteVendorsSchema>;
