import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import {
  CreateRfqInput,
  UpdateRfqInput,
  RfqStatus,
  InvitationStatus,
  Role,
} from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RfqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(organizationId: string, createdById: string, input: CreateRfqInput) {
    const rfq = await this.prisma.rfq.create({
      data: {
        organizationId,
        createdById,
        title: input.title,
        description: input.description || null,
        deadline: input.deadline,
        status: RfqStatus.DRAFT,
        items: {
          create: input.items.map((i) => ({
            name: i.name,
            description: i.description || null,
            quantity: i.quantity,
            unit: i.unit,
          })),
        },
      },
      include: { items: true },
    });

    await this.audit.log({
      organizationId,
      actorId: createdById,
      action: 'RFQ_CREATED',
      entityType: 'Rfq',
      entityId: rfq.id,
      metadata: { title: rfq.title, items: rfq.items.length },
    });
    return rfq;
  }

  async list(organizationId: string, status?: RfqStatus) {
    return this.prisma.rfq.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: {
        items: true,
        _count: { select: { invitations: true, quotations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, id: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, organizationId },
      include: {
        items: true,
        invitations: { include: { vendor: { select: { id: true, name: true, email: true } } } },
        quotations: { select: { id: true, vendorId: true, status: true, totalAmount: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async update(organizationId: string, actorId: string, id: string, input: UpdateRfqInput) {
    const rfq = await this.get(organizationId, id);
    if (rfq.status !== RfqStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT RFQs can be edited');
    }
    const updated = await this.prisma.rfq.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'RFQ_UPDATED',
      entityType: 'Rfq',
      entityId: id,
    });
    return updated;
  }

  /** Invite vendors → create invitations (idempotent), open the RFQ, notify (Spec §6.4). */
  async invite(organizationId: string, actorId: string, rfqId: string, vendorIds: string[]) {
    const rfq = await this.get(organizationId, rfqId);
    if (rfq.status === RfqStatus.CANCELLED || rfq.status === RfqStatus.AWARDED) {
      throw new BadRequestException(`Cannot invite vendors to a ${rfq.status} RFQ`);
    }

    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: vendorIds }, organizationId },
    });
    if (vendors.length !== vendorIds.length) {
      throw new BadRequestException('One or more vendors not found in your organization');
    }

    const created: { vendorId: string; token: string }[] = [];
    for (const vendor of vendors) {
      const existing = await this.prisma.rfqInvitation.findFirst({
        where: { rfqId, vendorId: vendor.id },
      });
      if (existing) continue;
      const token = nanoid(24);
      await this.prisma.rfqInvitation.create({
        data: { rfqId, vendorId: vendor.id, token, status: InvitationStatus.INVITED },
      });
      created.push({ vendorId: vendor.id, token });

      // Notify the vendor's portal user if linked.
      if (vendor.userId) {
        await this.notifications.create({
          organizationId,
          userId: vendor.userId,
          type: 'RFQ_INVITED',
          title: 'New RFQ invitation',
          body: `You have been invited to quote on "${rfq.title}".`,
        });
      }
      // TODO Phase 2: POST signed webhook to n8n for email + WhatsApp (degrade gracefully).
    }

    if (rfq.status === RfqStatus.DRAFT) {
      await this.prisma.rfq.update({ where: { id: rfqId }, data: { status: RfqStatus.OPEN } });
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: 'RFQ_INVITED',
      entityType: 'Rfq',
      entityId: rfqId,
      metadata: { invited: created.length, vendorIds },
    });

    return { invited: created.length, skipped: vendorIds.length - created.length };
  }

  async close(organizationId: string, actorId: string, id: string) {
    await this.get(organizationId, id);
    const rfq = await this.prisma.rfq.update({
      where: { id },
      data: { status: RfqStatus.CLOSED },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'RFQ_CLOSED',
      entityType: 'Rfq',
      entityId: id,
    });
    return rfq;
  }
}
