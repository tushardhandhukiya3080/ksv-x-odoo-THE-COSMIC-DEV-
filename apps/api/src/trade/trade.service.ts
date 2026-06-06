import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  TradeProfileInput,
  TradeConnectionInput,
  ListingInput,
} from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Trade profile (one per org) ──
  getProfile(organizationId: string) {
    return this.prisma.tradeProfile.findUnique({ where: { organizationId } });
  }

  async upsertProfile(organizationId: string, input: TradeProfileInput) {
    return this.prisma.tradeProfile.upsert({
      where: { organizationId },
      update: {
        type: input.type,
        country: input.country,
        incotermsDefault: input.incotermsDefault ?? null,
        currencies: input.currencies,
      },
      create: {
        organizationId,
        type: input.type,
        country: input.country,
        incotermsDefault: input.incotermsDefault ?? null,
        currencies: input.currencies,
      },
    });
  }

  // ── Organizations directory (to connect with) ──
  async organizations(organizationId: string) {
    const orgs = await this.prisma.organization.findMany({
      where: { id: { not: organizationId } },
      select: { id: true, name: true, gstin: true },
      orderBy: { name: 'asc' },
    });
    return orgs;
  }

  // ── Connections (B2B / P2P) ──
  async requestConnection(organizationId: string, input: TradeConnectionInput) {
    if (input.toOrgId === organizationId) {
      throw new BadRequestException('Cannot connect to your own organization');
    }
    const target = await this.prisma.organization.findUnique({ where: { id: input.toOrgId } });
    if (!target) throw new NotFoundException('Target organization not found');

    const existing = await this.prisma.tradeConnection.findFirst({
      where: {
        OR: [
          { fromOrgId: organizationId, toOrgId: input.toOrgId },
          { fromOrgId: input.toOrgId, toOrgId: organizationId },
        ],
      },
    });
    if (existing) throw new BadRequestException('A connection already exists between these orgs');

    const conn = await this.prisma.tradeConnection.create({
      data: {
        fromOrgId: organizationId,
        toOrgId: input.toOrgId,
        relationship: input.relationship,
        status: 'REQUESTED',
      },
    });
    await this.audit.log({
      organizationId,
      action: 'TRADE_CONNECTION_REQUESTED',
      entityType: 'TradeConnection',
      entityId: conn.id,
      metadata: { toOrgId: input.toOrgId, relationship: input.relationship },
    });
    return conn;
  }

  async listConnections(organizationId: string) {
    const conns = await this.prisma.tradeConnection.findMany({
      where: { OR: [{ fromOrgId: organizationId }, { toOrgId: organizationId }] },
      orderBy: { createdAt: 'desc' },
    });
    const orgIds = [...new Set(conns.flatMap((c) => [c.fromOrgId, c.toOrgId]))];
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(orgs.map((o) => [o.id, o.name]));
    return conns.map((c) => ({
      ...c,
      direction: c.fromOrgId === organizationId ? 'OUTGOING' : 'INCOMING',
      counterpartyName:
        nameOf.get(c.fromOrgId === organizationId ? c.toOrgId : c.fromOrgId) ?? 'Unknown',
    }));
  }

  async respondConnection(organizationId: string, id: string, accept: boolean) {
    const conn = await this.prisma.tradeConnection.findUnique({ where: { id } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.toOrgId !== organizationId) {
      throw new ForbiddenException('Only the recipient can respond to this request');
    }
    if (conn.status !== 'REQUESTED') {
      throw new BadRequestException('This connection has already been resolved');
    }
    const updated = await this.prisma.tradeConnection.update({
      where: { id },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED' },
    });
    await this.audit.log({
      organizationId,
      action: accept ? 'TRADE_CONNECTION_ACCEPTED' : 'TRADE_CONNECTION_REJECTED',
      entityType: 'TradeConnection',
      entityId: id,
    });
    return updated;
  }

  // ── Listings + marketplace discovery (cross-tenant) ──
  async createListing(organizationId: string, input: ListingInput) {
    const listing = await this.prisma.listing.create({
      data: {
        organizationId,
        title: input.title,
        description: input.description ?? null,
        priceFrom: input.priceFrom !== undefined ? new Prisma.Decimal(input.priceFrom) : null,
        currency: input.currency ?? 'USD',
        moq: input.moq ?? null,
        hsCode: input.hsCode ?? null,
      },
    });
    await this.audit.log({
      organizationId,
      action: 'LISTING_CREATED',
      entityType: 'Listing',
      entityId: listing.id,
      metadata: { title: listing.title },
    });
    return listing;
  }

  listMine(organizationId: string) {
    return this.prisma.listing.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteListing(organizationId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, organizationId } });
    if (!listing) throw new NotFoundException('Listing not found');
    await this.prisma.listing.delete({ where: { id } });
    return { ok: true };
  }

  /** Marketplace: listings from every organization (Spec §7.10). */
  async marketplace(organizationId: string, q?: string) {
    const listings = await this.prisma.listing.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { hsCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const orgIds = [...new Set(listings.map((l) => l.organizationId))];
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(orgs.map((o) => [o.id, o.name]));
    return listings.map((l) => ({
      ...l,
      priceFrom: l.priceFrom !== null ? Number(l.priceFrom) : null,
      supplierName: nameOf.get(l.organizationId) ?? 'Unknown',
      isOwn: l.organizationId === organizationId,
    }));
  }
}
