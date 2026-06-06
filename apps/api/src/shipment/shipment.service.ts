import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  CreateShipmentInput,
  ShipmentEventInput,
  ShipStatus,
  SOCKET_EVENTS,
  Role,
} from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class ShipmentService {
  private readonly logger = new Logger(ShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  /** Create a shipment from a PO (Spec §7.9). One shipment per PO. */
  async create(organizationId: string, actorId: string, input: CreateShipmentInput) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.poId, organizationId },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    const existing = await this.prisma.shipment.findUnique({ where: { poId: input.poId } });
    if (existing) throw new ConflictException('This PO already has a shipment');

    const shipment = await this.prisma.shipment.create({
      data: {
        poId: input.poId,
        mode: input.mode,
        carrier: input.carrier ?? null,
        trackingRef: input.trackingRef ?? null,
        originName: input.originName,
        originLat: input.originLat,
        originLng: input.originLng,
        destName: input.destName,
        destLat: input.destLat,
        destLng: input.destLng,
        status: ShipStatus.PENDING,
        etaAt: input.etaAt ?? null,
        currentLat: input.originLat,
        currentLng: input.originLng,
        events: {
          create: {
            status: ShipStatus.PENDING,
            lat: input.originLat,
            lng: input.originLng,
            note: 'Shipment created',
          },
        },
      },
      include: { events: true },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'SHIPMENT_CREATED',
      entityType: 'Shipment',
      entityId: shipment.id,
      metadata: { poNumber: po.poNumber, mode: input.mode },
    });
    this.events.emitToOrg(organizationId, SOCKET_EVENTS.SHIPMENT_UPDATE, { shipmentId: shipment.id });
    return shipment;
  }

  list(organizationId: string) {
    return this.prisma.shipment.findMany({
      where: { po: { organizationId } },
      include: { po: { select: { poNumber: true, vendor: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(organizationId: string, id: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, po: { organizationId } },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        po: { select: { poNumber: true, vendor: { select: { name: true } } } },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  /** Append a tracking event + move the shipment's status/position (Spec §7.9). */
  async addEvent(
    organizationId: string,
    actorId: string,
    id: string,
    input: ShipmentEventInput,
  ) {
    const shipment = await this.get(organizationId, id);

    await this.prisma.$transaction([
      this.prisma.shipmentEvent.create({
        data: {
          shipmentId: id,
          status: input.status,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          note: input.note ?? null,
        },
      }),
      this.prisma.shipment.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.lat !== undefined ? { currentLat: input.lat } : {}),
          ...(input.lng !== undefined ? { currentLng: input.lng } : {}),
          ...(input.etaAt !== undefined ? { etaAt: input.etaAt } : {}),
        },
      }),
    ]);

    await this.audit.log({
      organizationId,
      actorId,
      action: 'SHIPMENT_STATUS',
      entityType: 'Shipment',
      entityId: id,
      metadata: { status: input.status, note: input.note },
    });
    await this.notifications.notifyRoles(organizationId, [Role.PROCUREMENT_OFFICER, Role.ADMIN], {
      type: 'SHIPMENT_UPDATE',
      title: 'Shipment update',
      body: `Shipment for PO ${shipment.po.poNumber} is now ${input.status.replace(/_/g, ' ')}.`,
    });
    this.events.emitToOrg(organizationId, SOCKET_EVENTS.SHIPMENT_UPDATE, { shipmentId: id });

    return this.get(organizationId, id);
  }

  /** Geocode a place name via Nominatim; degrades to null when offline (Spec §7.9). */
  async geocode(query: string): Promise<{ name: string; lat: number; lng: number } | null> {
    try {
      const url = `${process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'VendorBridge/1.0' } });
      if (!res.ok) return null;
      const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      if (!data.length) return null;
      return {
        name: data[0].display_name,
        lat: Number(data[0].lat),
        lng: Number(data[0].lon),
      };
    } catch (err) {
      this.logger.warn(`Geocode failed for "${query}": ${(err as Error).message}`);
      return null;
    }
  }
}
