import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import {
  QuotationStatus,
  PoStatus,
  poNumber as formatPoNumber,
  Role,
} from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PdfService } from '../documents/pdf.service';
import { renderDocumentHtml, DocModel } from '../documents/templates';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly pdf: PdfService,
  ) {}

  /** Issue a PO from a submitted (approved) quotation (Spec §6.8). */
  async create(organizationId: string, actorId: string, quotationId: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: true,
        vendor: true,
        rfq: { select: { organizationId: true, title: true, items: true } },
      },
    });
    if (!quotation || quotation.rfq.organizationId !== organizationId) {
      throw new NotFoundException('Quotation not found');
    }
    if (quotation.status !== QuotationStatus.SUBMITTED) {
      throw new BadRequestException('Only submitted quotations can be converted to a PO');
    }

    const existing = await this.prisma.purchaseOrder.findUnique({ where: { quotationId } });
    if (existing) throw new ConflictException('A purchase order already exists for this quotation');

    const rfqItemNames = new Map(quotation.rfq.items.map((i) => [i.id, i.name]));
    const year = new Date().getFullYear();
    const seqBase = await this.prisma.purchaseOrder.count({
      where: { organizationId, poNumber: { startsWith: `PO-${year}-` } },
    });
    const poNumber = formatPoNumber(year, seqBase + 1);

    const po = await this.prisma.purchaseOrder.create({
      data: {
        organizationId,
        poNumber,
        quotationId,
        vendorId: quotation.vendorId,
        status: PoStatus.ISSUED,
        totalAmount: quotation.totalAmount,
        currency: quotation.currency,
        items: {
          create: quotation.items.map((it) => ({
            description: rfqItemNames.get(it.rfqItemId) ?? 'Item',
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            taxRate: it.taxRate,
            lineTotal: it.lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'PO_ISSUED',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      metadata: { poNumber, quotationId, total: String(po.totalAmount) },
    });
    if (quotation.vendor.userId) {
      await this.notifications.create({
        organizationId,
        userId: quotation.vendor.userId,
        type: 'PO_ISSUED',
        title: 'Purchase order issued',
        body: `PO ${poNumber} has been issued to you.`,
      });
    }
    return po;
  }

  list(organizationId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId },
      include: {
        vendor: { select: { id: true, name: true } },
        invoice: { select: { id: true, status: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async get(organizationId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        vendor: true,
        quotation: { include: { rfq: { select: { title: true } } } },
        invoice: { select: { id: true, status: true, invoiceNumber: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async updateStatus(organizationId: string, actorId: string, id: string, status: PoStatus) {
    await this.get(organizationId, id);
    const po = await this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'PO_STATUS_CHANGED',
      entityType: 'PurchaseOrder',
      entityId: id,
      metadata: { status },
    });
    return po;
  }

  /** Returns { pdf } buffer when Chromium is available, else { html } fallback. */
  async document(organizationId: string, id: string): Promise<{ pdf?: Buffer; html: string; poNumber: string }> {
    const po = await this.get(organizationId, id);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, gstin: true },
    });

    const model: DocModel = {
      type: 'PURCHASE ORDER',
      number: po.poNumber,
      status: po.status,
      date: po.issuedAt,
      org: { name: org?.name ?? 'Organization', gstin: org?.gstin },
      party: {
        name: po.vendor.name,
        email: po.vendor.email,
        gstin: po.vendor.gstin,
        address: po.vendor.address,
      },
      lines: po.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        taxRate: Number(i.taxRate),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: po.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
      taxTotal:
        Number(po.totalAmount) - po.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0),
      grandTotal: Number(po.totalAmount),
      currency: po.currency,
    };

    const html = renderDocumentHtml(model);
    const pdf = await this.pdf.renderToPdf(html);
    return { pdf: pdf ?? undefined, html, poNumber: po.poNumber };
  }
}
