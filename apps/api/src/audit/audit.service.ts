import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  organizationId: string;
  actorId?: string | null;
  action: string; // e.g. VENDOR_CREATED, RFQ_INVITED, PO_ISSUED
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const GENESIS = '0'.repeat(64);

/**
 * Append-only, hash-chained audit ledger (Spec §7.7).
 * Each row: dataHash = sha256(action+entity+payload); prevHash = previous row's
 * hash for the org; hash = sha256(dataHash + prevHash). Never UPDATE/DELETE.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    const metadataJson = input.metadata ?? {};
    const dataHash = sha256(
      `${input.action}|${input.entityType}|${input.entityId}|${JSON.stringify(metadataJson)}`,
    );

    const prev = await this.prisma.auditLog.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });
    const prevHash = prev?.hash ?? GENESIS;
    const hash = sha256(dataHash + prevHash);

    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        dataHash,
        prevHash,
        hash,
        metadataJson: metadataJson as Prisma.InputJsonValue,
      },
    });
  }

  /** Walks the chain for an org and reports the first break (Spec §7.7). */
  async verifyChain(organizationId: string): Promise<{ ok: boolean; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    let prevHash = GENESIS;
    for (const row of rows) {
      const expected = sha256(row.dataHash + prevHash);
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { ok: false, brokenAt: row.id };
      }
      prevHash = row.hash;
    }
    return { ok: true };
  }

  list(organizationId: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
