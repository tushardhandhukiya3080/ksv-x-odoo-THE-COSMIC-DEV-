// String-literal mirrors of the Prisma enums so the browser bundle never imports
// @prisma/client. Keep in sync with infra/prisma/schema.prisma.

export const Role = {
  PROCUREMENT_OFFICER: 'PROCUREMENT_OFFICER',
  VENDOR: 'VENDOR',
  APPROVER: 'APPROVER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const VendorStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BLACKLISTED: 'BLACKLISTED',
} as const;
export type VendorStatus = (typeof VendorStatus)[keyof typeof VendorStatus];

export const RfqStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  AWARDED: 'AWARDED',
  CANCELLED: 'CANCELLED',
} as const;
export type RfqStatus = (typeof RfqStatus)[keyof typeof RfqStatus];

export const InvitationStatus = {
  INVITED: 'INVITED',
  VIEWED: 'VIEWED',
  SUBMITTED: 'SUBMITTED',
  DECLINED: 'DECLINED',
} as const;
export type InvitationStatus = (typeof InvitationStatus)[keyof typeof InvitationStatus];

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const PoStatus = {
  ISSUED: 'ISSUED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
} as const;
export type PoStatus = (typeof PoStatus)[keyof typeof PoStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentStatus = {
  CREATED: 'CREATED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ShipMode = { LAND: 'LAND', AIR: 'AIR', SEA: 'SEA' } as const;
export type ShipMode = (typeof ShipMode)[keyof typeof ShipMode];

export const ShipStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  CUSTOMS: 'CUSTOMS',
  DELIVERED: 'DELIVERED',
  DELAYED: 'DELAYED',
} as const;
export type ShipStatus = (typeof ShipStatus)[keyof typeof ShipStatus];

export const NotifChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
} as const;
export type NotifChannel = (typeof NotifChannel)[keyof typeof NotifChannel];

export const ALL_ROLES: Role[] = Object.values(Role);
