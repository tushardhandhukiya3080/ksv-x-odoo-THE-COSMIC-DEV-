import { Injectable } from '@nestjs/common';
import { RfqStatus, ApprovalStatus, InvoiceStatus, PoStatus } from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(organizationId: string) {
    const [activeRfqs, pendingApprovals, openInvoices, paidInvoices, vendorCount, poCount] =
      await this.prisma.$transaction([
        this.prisma.rfq.count({
          where: { organizationId, status: { in: [RfqStatus.OPEN, RfqStatus.DRAFT] } },
        }),
        this.prisma.approval.count({
          where: { organizationId, status: ApprovalStatus.PENDING },
        }),
        this.prisma.invoice.count({
          where: { organizationId, status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } },
        }),
        this.prisma.invoice.findMany({
          where: { organizationId, status: InvoiceStatus.PAID },
          select: { grandTotal: true },
        }),
        this.prisma.vendor.count({ where: { organizationId } }),
        this.prisma.purchaseOrder.count({ where: { organizationId } }),
      ]);

    const totalSpend = paidInvoices.reduce((s, i) => s + Number(i.grandTotal), 0);

    const recentPos = await this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: { vendor: { select: { name: true } } },
      orderBy: { issuedAt: 'desc' },
      take: 5,
    });
    const recentInvoices = await this.prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const recentActivity = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { action: true, entityType: true, entityId: true, createdAt: true, actorId: true },
    });

    return {
      cards: {
        activeRfqs,
        pendingApprovals,
        openInvoices,
        totalSpend,
        vendorCount,
        poCount,
      },
      recentPos: recentPos.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        vendor: p.vendor.name,
        total: Number(p.totalAmount),
        status: p.status,
        issuedAt: p.issuedAt,
      })),
      recentInvoices: recentInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        total: Number(i.grandTotal),
        status: i.status,
        createdAt: i.createdAt,
      })),
      recentActivity,
    };
  }
}
