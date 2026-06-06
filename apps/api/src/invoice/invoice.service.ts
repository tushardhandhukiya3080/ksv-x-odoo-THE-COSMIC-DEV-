import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import {
  InvoiceStatus,
  computeTotals,
  invoiceNumber as formatInvoiceNumber,
} from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PdfService } from '../documents/pdf.service';
import { renderDocumentHtml, DocModel } from '../documents/templates';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdf: PdfService,
  ) {}

  /** Generate an invoice from a PO with server-side tax + totals (Spec §6.8). */
  async create(organizationId: string, actorId: string, poId: string, dueInDays = 30) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, organizationId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    const existing = await this.prisma.invoice.findUnique({ where: { poId } });
    if (existing) throw new ConflictException('An invoice already exists for this PO');

    const { lines, subtotal, taxTotal, grandTotal } = computeTotals(
      po.items.map((i) => ({
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        taxRate: Number(i.taxRate),
      })),
    );

    const year = new Date().getFullYear();
    const seqBase = await this.prisma.invoice.count({
      where: { organizationId, invoiceNumber: { startsWith: `INV-${year}-` } },
    });
    const invoiceNumber = formatInvoiceNumber(year, seqBase + 1);
    const dueDate = new Date(Date.now() + dueInDays * 86_400_000);

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        invoiceNumber,
        poId,
        status: InvoiceStatus.DRAFT,
        subtotal: new Prisma.Decimal(subtotal),
        taxTotal: new Prisma.Decimal(taxTotal),
        grandTotal: new Prisma.Decimal(grandTotal),
        currency: po.currency,
        dueDate,
        items: {
          create: po.items.map((i, idx) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            taxRate: i.taxRate,
            lineTotal: new Prisma.Decimal(lines[idx].lineTotal),
          })),
        },
      },
      include: { items: true },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber, grandTotal },
    });
    return invoice;
  }

  list(organizationId: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId },
      include: {
        po: { include: { vendor: { select: { name: true } } } },
        payments: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        payments: true,
        po: { include: { vendor: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async send(organizationId: string, actorId: string, id: string) {
    const invoice = await this.get(organizationId, id);
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'INVOICE_SENT',
      entityType: 'Invoice',
      entityId: id,
    });
    // TODO Phase 2: POST signed webhook to n8n to email the PDF (degrade gracefully).
    return updated;
  }

  async document(
    organizationId: string,
    id: string,
  ): Promise<{ pdf?: Buffer; html: string; invoiceNumber: string }> {
    const invoice = await this.get(organizationId, id);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, gstin: true },
    });

    const model: DocModel = {
      type: 'INVOICE',
      number: invoice.invoiceNumber,
      status: invoice.status,
      date: invoice.createdAt,
      dueDate: invoice.dueDate,
      org: { name: org?.name ?? 'Organization', gstin: org?.gstin },
      party: {
        name: invoice.po.vendor.name,
        email: invoice.po.vendor.email,
        gstin: invoice.po.vendor.gstin,
        address: invoice.po.vendor.address,
      },
      lines: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        taxRate: Number(i.taxRate),
        lineTotal: Number(i.lineTotal),
      })),
      subtotal: Number(invoice.subtotal),
      taxTotal: Number(invoice.taxTotal),
      grandTotal: Number(invoice.grandTotal),
      currency: invoice.currency,
    };

    const html = renderDocumentHtml(model);
    const pdf = await this.pdf.renderToPdf(html);
    return { pdf: pdf ?? undefined, html, invoiceNumber: invoice.invoiceNumber };
  }
}
