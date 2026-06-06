import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateQuotationInput,
  UpdateQuotationInput,
  QuotationStatus,
  InvitationStatus,
  computeTotals,
  computeLine,
  Role,
} from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────── Vendor portal (token-based) ───────────────
  private async invitationByToken(token: string) {
    const invitation = await this.prisma.rfqInvitation.findUnique({
      where: { token },
      include: {
        rfq: { include: { items: true } },
        vendor: { select: { id: true, name: true, organizationId: true } },
      },
    });
    if (!invitation) throw new NotFoundException('Invalid invitation link');
    return invitation;
  }

  async getPortalRfq(token: string) {
    const invitation = await this.invitationByToken(token);
    if (invitation.status === InvitationStatus.INVITED) {
      await this.prisma.rfqInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.VIEWED },
      });
    }
    const quotation = await this.prisma.quotation.findFirst({
      where: { rfqId: invitation.rfqId, vendorId: invitation.vendorId },
      include: { items: true },
    });
    return {
      rfq: {
        id: invitation.rfq.id,
        title: invitation.rfq.title,
        description: invitation.rfq.description,
        deadline: invitation.rfq.deadline,
        status: invitation.rfq.status,
        items: invitation.rfq.items,
      },
      vendor: { id: invitation.vendor.id, name: invitation.vendor.name },
      quotation,
      deadlinePassed: invitation.rfq.deadline.getTime() < Date.now(),
    };
  }

  async createDraft(input: CreateQuotationInput) {
    const invitation = await this.invitationByToken(input.token);
    const { rfq, vendor } = invitation;
    if (rfq.deadline.getTime() < Date.now()) {
      throw new BadRequestException('The RFQ deadline has passed');
    }

    const existing = await this.prisma.quotation.findFirst({
      where: { rfqId: rfq.id, vendorId: vendor.id },
    });
    if (existing && existing.status === QuotationStatus.SUBMITTED) {
      throw new BadRequestException('Quotation already submitted and locked');
    }

    this.assertItemsBelongToRfq(input.items, rfq.items);
    const { lines, grandTotal } = computeTotals(input.items);

    const data = {
      rfqId: rfq.id,
      vendorId: vendor.id,
      status: QuotationStatus.DRAFT,
      deliveryDays: input.deliveryDays,
      validUntil: input.validUntil ?? null,
      notes: input.notes ?? null,
      currency: input.currency ?? 'INR',
      totalAmount: new Prisma.Decimal(grandTotal),
    };

    const quotation = await this.prisma.$transaction(async (tx) => {
      const q = existing
        ? await tx.quotation.update({ where: { id: existing.id }, data })
        : await tx.quotation.create({ data });
      await tx.quotationItem.deleteMany({ where: { quotationId: q.id } });
      await tx.quotationItem.createMany({
        data: input.items.map((item, idx) => ({
          quotationId: q.id,
          rfqItemId: item.rfqItemId,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          quantity: item.quantity,
          taxRate: new Prisma.Decimal(lines[idx].taxRate),
          lineTotal: new Prisma.Decimal(lines[idx].lineTotal),
        })),
      });
      return q;
    });

    return this.prisma.quotation.findUnique({
      where: { id: quotation.id },
      include: { items: true },
    });
  }

  async submit(token: string, quotationId: string) {
    const invitation = await this.invitationByToken(token);
    const quotation = await this.prisma.quotation.findFirst({
      where: { id: quotationId, vendorId: invitation.vendorId, rfqId: invitation.rfqId },
      include: { items: true, rfq: { include: { items: true } } },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status === QuotationStatus.SUBMITTED) {
      throw new BadRequestException('Quotation already submitted');
    }
    if (quotation.rfq.deadline.getTime() < Date.now()) {
      throw new BadRequestException('The RFQ deadline has passed');
    }
    // Every RFQ line must be priced.
    const pricedItemIds = new Set(quotation.items.map((i) => i.rfqItemId));
    const missing = quotation.rfq.items.filter((i) => !pricedItemIds.has(i.id));
    if (missing.length > 0) {
      throw new BadRequestException(`All RFQ items must be priced (${missing.length} missing)`);
    }

    const submitted = await this.prisma.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.SUBMITTED, submittedAt: new Date() },
    });
    await this.prisma.rfqInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.SUBMITTED },
    });

    const orgId = invitation.vendor.organizationId;
    await this.audit.log({
      organizationId: orgId,
      actorId: null,
      action: 'QUOTATION_SUBMITTED',
      entityType: 'Quotation',
      entityId: quotationId,
      metadata: { vendorId: invitation.vendorId, rfqId: invitation.rfqId },
    });
    await this.notifications.notifyRoles(orgId, [Role.PROCUREMENT_OFFICER, Role.ADMIN], {
      type: 'QUOTATION_RECEIVED',
      title: 'New quotation received',
      body: `${invitation.vendor.name} submitted a quotation for "${invitation.rfq.title}".`,
    });

    return submitted;
  }

  private assertItemsBelongToRfq(
    items: { rfqItemId: string }[],
    rfqItems: { id: string }[],
  ) {
    const valid = new Set(rfqItems.map((i) => i.id));
    for (const item of items) {
      if (!valid.has(item.rfqItemId)) {
        throw new BadRequestException(`Item ${item.rfqItemId} does not belong to this RFQ`);
      }
    }
  }

  // ─────────────── Officer side: comparison ───────────────
  async comparison(organizationId: string, rfqId: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: rfqId, organizationId },
      include: { items: true },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const quotations = await this.prisma.quotation.findMany({
      where: { rfqId, status: QuotationStatus.SUBMITTED },
      include: {
        items: true,
        vendor: { select: { id: true, name: true, rating: true, status: true } },
      },
    });

    const rows = quotations.map((q) => ({
      quotationId: q.id,
      vendor: q.vendor,
      deliveryDays: q.deliveryDays,
      currency: q.currency,
      notes: q.notes,
      validUntil: q.validUntil,
      total: Number(q.totalAmount),
      items: q.items.map((it) => ({
        rfqItemId: it.rfqItemId,
        unitPrice: Number(it.unitPrice),
        quantity: it.quantity,
        taxRate: Number(it.taxRate),
        lineTotal: Number(it.lineTotal),
      })),
    }));

    const lowestTotal = rows.length ? Math.min(...rows.map((r) => r.total)) : 0;
    const fastest = rows.length ? Math.min(...rows.map((r) => r.deliveryDays)) : 0;

    return {
      rfq: { id: rfq.id, title: rfq.title, deadline: rfq.deadline, items: rfq.items },
      quotations: rows.map((r) => ({
        ...r,
        isLowest: r.total === lowestTotal,
        isFastest: r.deliveryDays === fastest,
      })),
      summary: { lowestTotal, fastestDeliveryDays: fastest, count: rows.length },
    };
  }

  /**
   * Deterministic recommendation (Spec §7.1 fallback). The AI panel layers on top
   * in Phase 2; this is the always-available baseline: weighted price + delivery + rating.
   */
  async deterministicRecommendation(organizationId: string, rfqId: string) {
    const { quotations } = await this.comparison(organizationId, rfqId);
    if (quotations.length === 0) return { recommendedQuotationId: null, ranking: [] };

    const maxTotal = Math.max(...quotations.map((q) => q.total));
    const maxDelivery = Math.max(...quotations.map((q) => q.deliveryDays));

    const ranking = quotations
      .map((q) => {
        const priceScore = maxTotal ? 1 - q.total / maxTotal : 1; // cheaper = higher
        const deliveryScore = maxDelivery ? 1 - q.deliveryDays / maxDelivery : 1;
        const ratingScore = (q.vendor.rating ?? 0) / 5;
        const score = 0.5 * priceScore + 0.3 * deliveryScore + 0.2 * ratingScore;
        return {
          quotationId: q.quotationId,
          score: Math.round(score * 1000) / 1000,
          rationale: `Price ${q.total}, ${q.deliveryDays}d delivery, rating ${q.vendor.rating}`,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { recommendedQuotationId: ranking[0]?.quotationId ?? null, ranking };
  }
}
