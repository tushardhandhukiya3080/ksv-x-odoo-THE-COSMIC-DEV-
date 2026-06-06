import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Spend summary: total paid + outstanding (Spec §6.10). */
  async spend(organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId },
      select: { grandTotal: true, status: true },
    });
    const paid = invoices
      .filter((i) => i.status === InvoiceStatus.PAID)
      .reduce((s, i) => s + Number(i.grandTotal), 0);
    const outstanding = invoices
      .filter((i) => i.status === InvoiceStatus.SENT || i.status === InvoiceStatus.OVERDUE)
      .reduce((s, i) => s + Number(i.grandTotal), 0);
    return { paid, outstanding, totalInvoices: invoices.length };
  }

  /** Vendor performance: PO count + spend + rating per vendor. */
  async vendors(organizationId: string) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        rating: true,
        status: true,
        _count: { select: { quotations: true, purchaseOrders: true } },
      },
    });
    const pos = await this.prisma.purchaseOrder.groupBy({
      by: ['vendorId'],
      where: { organizationId },
      _sum: { totalAmount: true },
    });
    const spendByVendor = new Map(pos.map((p) => [p.vendorId, Number(p._sum.totalAmount ?? 0)]));

    return vendors
      .map((v) => ({
        id: v.id,
        name: v.name,
        rating: v.rating,
        status: v.status,
        quotations: v._count.quotations,
        purchaseOrders: v._count.purchaseOrders,
        spend: spendByVendor.get(v.id) ?? 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }

  /** Monthly procurement trends over the last 6 months (PO totals + counts). */
  async trends(organizationId: string) {
    const since = new Date();
    since.setMonth(since.getMonth() - 5);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const pos = await this.prisma.purchaseOrder.findMany({
      where: { organizationId, issuedAt: { gte: since } },
      select: { totalAmount: true, issuedAt: true },
    });

    const buckets = new Map<string, { spend: number; count: number }>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      buckets.set(monthKey(d), { spend: 0, count: 0 });
    }
    for (const po of pos) {
      const key = monthKey(po.issuedAt);
      const b = buckets.get(key);
      if (b) {
        b.spend += Number(po.totalAmount);
        b.count += 1;
      }
    }
    return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v }));
  }

  async export(organizationId: string): Promise<{ filename: string; csv: string }> {
    const vendors = await this.vendors(organizationId);
    const header = 'Vendor,Rating,Status,Quotations,PurchaseOrders,Spend';
    const rows = vendors.map(
      (v) =>
        `"${v.name}",${v.rating},${v.status},${v.quotations},${v.purchaseOrders},${v.spend}`,
    );
    return {
      filename: `vendor-report-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: [header, ...rows].join('\n'),
    };
  }
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
