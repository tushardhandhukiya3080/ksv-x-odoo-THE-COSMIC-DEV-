import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateVendorInput, UpdateVendorInput, VendorStatus } from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface VendorQuery {
  q?: string;
  status?: VendorStatus;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, query: VendorQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, query.pageSize ?? 20);

    const where: Prisma.VendorWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { gstin: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async get(organizationId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId },
      include: { category: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async create(organizationId: string, actorId: string, input: CreateVendorInput) {
    const dup = await this.prisma.vendor.findFirst({
      where: { organizationId, email: input.email },
    });
    if (dup) throw new ConflictException('A vendor with this email already exists');

    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId,
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        address: input.address || null,
        gstin: input.gstin || null,
        categoryId: input.categoryId || null,
        whatsappOptIn: input.whatsappOptIn ?? true,
        status: input.status ?? VendorStatus.ACTIVE,
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'VENDOR_CREATED',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: { name: vendor.name, email: vendor.email },
    });
    return vendor;
  }

  async update(organizationId: string, actorId: string, id: string, input: UpdateVendorInput) {
    await this.get(organizationId, id);
    if (input.email) {
      const dup = await this.prisma.vendor.findFirst({
        where: { organizationId, email: input.email, NOT: { id } },
      });
      if (dup) throw new ConflictException('Another vendor already uses this email');
    }
    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin || null } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
        ...(input.whatsappOptIn !== undefined ? { whatsappOptIn: input.whatsappOptIn } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'VENDOR_UPDATED',
      entityType: 'Vendor',
      entityId: id,
      metadata: { changes: input as Record<string, unknown> },
    });
    return vendor;
  }

  async remove(organizationId: string, actorId: string, id: string) {
    await this.get(organizationId, id);
    const quotationCount = await this.prisma.quotation.count({ where: { vendorId: id } });
    if (quotationCount > 0) {
      // Preserve procurement history: blacklist instead of hard-delete.
      await this.prisma.vendor.update({
        where: { id },
        data: { status: VendorStatus.BLACKLISTED },
      });
      await this.audit.log({
        organizationId,
        actorId,
        action: 'VENDOR_BLACKLISTED',
        entityType: 'Vendor',
        entityId: id,
      });
      return { ok: true, softDeleted: true };
    }
    await this.prisma.vendor.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'VENDOR_DELETED',
      entityType: 'Vendor',
      entityId: id,
    });
    return { ok: true, softDeleted: false };
  }

  // ── Categories ──
  listCategories(organizationId: string) {
    return this.prisma.vendorCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(organizationId: string, name: string) {
    const exists = await this.prisma.vendorCategory.findFirst({
      where: { organizationId, name },
    });
    if (exists) throw new ConflictException('Category already exists');
    return this.prisma.vendorCategory.create({ data: { organizationId, name } });
  }
}
