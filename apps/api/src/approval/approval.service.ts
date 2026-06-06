import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateApprovalInput,
  ApprovalDecisionInput,
  ApprovalStatus,
  RfqStatus,
  Role,
  SOCKET_EVENTS,
} from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateApprovalInput) {
    // Validate approvers belong to the org and can approve.
    const approvers = await this.prisma.user.findMany({
      where: {
        id: { in: input.approverIds },
        organizationId,
        role: { in: [Role.APPROVER, Role.ADMIN] as never },
      },
    });
    if (approvers.length !== input.approverIds.length) {
      throw new BadRequestException('All approvers must be Approver/Admin users in your org');
    }

    const existing = await this.prisma.approval.findFirst({
      where: {
        organizationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        status: ApprovalStatus.PENDING,
      },
    });
    if (existing) throw new BadRequestException('An approval is already pending for this subject');

    const approval = await this.prisma.approval.create({
      data: {
        organizationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        status: ApprovalStatus.PENDING,
        currentStep: 1,
        steps: {
          create: input.approverIds.map((approverId, idx) => ({
            approverId,
            order: idx + 1,
            decision: ApprovalStatus.PENDING,
          })),
        },
      },
      include: { steps: true },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'APPROVAL_CREATED',
      entityType: 'Approval',
      entityId: approval.id,
      metadata: { subjectType: input.subjectType, subjectId: input.subjectId },
    });

    // Notify the first approver.
    const first = approval.steps.find((s) => s.order === 1);
    if (first) {
      await this.notifications.create({
        organizationId,
        userId: first.approverId,
        type: 'APPROVAL_PENDING',
        title: 'Approval requested',
        body: `A ${input.subjectType.toLowerCase()} is awaiting your approval.`,
      });
    }
    return this.get(organizationId, approval.id);
  }

  async get(organizationId: string, id: string) {
    const approval = await this.prisma.approval.findFirst({
      where: { id, organizationId },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: { approver: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }

  async listPending(organizationId: string, approverId: string) {
    return this.prisma.approval.findMany({
      where: {
        organizationId,
        status: ApprovalStatus.PENDING,
        steps: { some: { approverId, decision: ApprovalStatus.PENDING } },
      },
      include: {
        steps: { orderBy: { order: 'asc' }, include: { approver: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decide(
    organizationId: string,
    approverId: string,
    approvalId: string,
    input: ApprovalDecisionInput,
  ) {
    const approval = await this.get(organizationId, approvalId);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval is already resolved');
    }

    const step = approval.steps.find((s) => s.order === approval.currentStep);
    if (!step) throw new BadRequestException('No active approval step');
    if (step.approverId !== approverId) {
      throw new ForbiddenException('You are not the approver for the current step');
    }

    await this.prisma.approvalStep.update({
      where: { id: step.id },
      data: { decision: input.decision, remarks: input.remarks ?? null, decidedAt: new Date() },
    });

    let finalStatus: ApprovalStatus = ApprovalStatus.PENDING;
    if (input.decision === ApprovalStatus.REJECTED) {
      finalStatus = ApprovalStatus.REJECTED;
      await this.prisma.approval.update({
        where: { id: approvalId },
        data: { status: ApprovalStatus.REJECTED },
      });
    } else {
      const isLast = approval.currentStep >= approval.steps.length;
      if (isLast) {
        finalStatus = ApprovalStatus.APPROVED;
        await this.prisma.approval.update({
          where: { id: approvalId },
          data: { status: ApprovalStatus.APPROVED },
        });
        await this.onFullyApproved(organizationId, approval.subjectType, approval.subjectId);
      } else {
        await this.prisma.approval.update({
          where: { id: approvalId },
          data: { currentStep: approval.currentStep + 1 },
        });
        const next = approval.steps.find((s) => s.order === approval.currentStep + 1);
        if (next) {
          await this.notifications.create({
            organizationId,
            userId: next.approverId,
            type: 'APPROVAL_PENDING',
            title: 'Approval requested',
            body: 'A subject is awaiting your approval.',
          });
        }
      }
    }

    await this.audit.log({
      organizationId,
      actorId: approverId,
      action: `APPROVAL_${input.decision}`,
      entityType: 'Approval',
      entityId: approvalId,
      metadata: { step: approval.currentStep, remarks: input.remarks },
    });
    await this.notifications.notifyRoles(organizationId, [Role.PROCUREMENT_OFFICER, Role.ADMIN], {
      type: 'APPROVAL_UPDATED',
      title: `Approval ${finalStatus === ApprovalStatus.PENDING ? 'advanced' : finalStatus.toLowerCase()}`,
      body: `${approval.subjectType} approval was ${input.decision.toLowerCase()}.`,
    });
    this.events.emitToOrg(organizationId, SOCKET_EVENTS.APPROVAL_UPDATED, {
      approvalId,
      status: finalStatus,
    });

    return this.get(organizationId, approvalId);
  }

  /** When a QUOTATION approval is fully approved, award its RFQ. */
  private async onFullyApproved(organizationId: string, subjectType: string, subjectId: string) {
    if (subjectType !== 'QUOTATION') return;
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: subjectId },
      select: { rfqId: true },
    });
    if (quotation) {
      await this.prisma.rfq.updateMany({
        where: { id: quotation.rfqId, organizationId },
        data: { status: RfqStatus.AWARDED },
      });
    }
  }
}
