// Centralized business defaults (Spec §14.6 documented decisions).

/** Default GST rate (percent) applied to a line when none is supplied. */
export const DEFAULT_TAX_RATE = 18;

/** PO number format: PO-{YYYY}-{0000seq}, sequence per org per year. */
export const poNumber = (year: number, seq: number) =>
  `PO-${year}-${String(seq).padStart(4, '0')}`;

/** Invoice number format: INV-{YYYY}-{0000seq}, sequence per org per year. */
export const invoiceNumber = (year: number, seq: number) =>
  `INV-${year}-${String(seq).padStart(4, '0')}`;

/** GSTIN: 15 chars — 2 digit state, 10 char PAN, 1 entity, 'Z', 1 checksum. */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Socket.io event names (Spec §7.3). */
export const SOCKET_EVENTS = {
  RFQ_INVITED: 'rfq:invited',
  QUOTATION_RECEIVED: 'quotation:received',
  APPROVAL_UPDATED: 'approval:updated',
  INVOICE_STATUS: 'invoice:status',
  SHIPMENT_UPDATE: 'shipment:update',
  DASHBOARD_UPDATE: 'dashboard:update',
  NOTIFICATION_NEW: 'notification:new',
} as const;

export const API_PREFIX = 'api/v1';
