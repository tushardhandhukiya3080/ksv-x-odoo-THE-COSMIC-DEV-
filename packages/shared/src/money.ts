// Server-authoritative money math. All amounts in major units (e.g. rupees) with
// 2-decimal rounding. Never trust client-computed totals (Spec §9, §6.8).

import { DEFAULT_TAX_RATE } from './constants.js';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineInput {
  unitPrice: number;
  quantity: number;
  /** percent; falls back to DEFAULT_TAX_RATE when undefined */
  taxRate?: number;
}

export interface LineComputed extends LineInput {
  taxRate: number;
  netAmount: number; // unitPrice * quantity
  taxAmount: number; // net * taxRate%
  lineTotal: number; // net + tax
}

export function computeLine(line: LineInput): LineComputed {
  const taxRate = line.taxRate ?? DEFAULT_TAX_RATE;
  const netAmount = round2(line.unitPrice * line.quantity);
  const taxAmount = round2((netAmount * taxRate) / 100);
  const lineTotal = round2(netAmount + taxAmount);
  return { ...line, taxRate, netAmount, taxAmount, lineTotal };
}

export interface Totals {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: LineComputed[];
}

export function computeTotals(lines: LineInput[]): Totals {
  const computed = lines.map(computeLine);
  const subtotal = round2(computed.reduce((s, l) => s + l.netAmount, 0));
  const taxTotal = round2(computed.reduce((s, l) => s + l.taxAmount, 0));
  const grandTotal = round2(subtotal + taxTotal);
  return { subtotal, taxTotal, grandTotal, lines: computed };
}
