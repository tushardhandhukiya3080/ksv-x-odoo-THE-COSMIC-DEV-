import { z } from 'zod';
import { ShipMode, ShipStatus } from '../enums.js';

export const createShipmentSchema = z.object({
  poId: z.string(),
  mode: z.nativeEnum(ShipMode),
  carrier: z.string().max(120).optional(),
  trackingRef: z.string().max(120).optional(),
  originName: z.string().min(1).max(160),
  originLat: z.number().min(-90).max(90),
  originLng: z.number().min(-180).max(180),
  destName: z.string().min(1).max(160),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
  etaAt: z.coerce.date().optional(),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const shipmentEventSchema = z.object({
  status: z.nativeEnum(ShipStatus),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().max(300).optional(),
  etaAt: z.coerce.date().optional(),
});
export type ShipmentEventInput = z.infer<typeof shipmentEventSchema>;
