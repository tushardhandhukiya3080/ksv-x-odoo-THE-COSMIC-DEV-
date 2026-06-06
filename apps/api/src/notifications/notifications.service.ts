import { Injectable } from '@nestjs/common';
import { NotifChannel } from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channel?: NotifChannel;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        channel: input.channel ?? NotifChannel.IN_APP,
      },
    });
  }

  /** Notify every user holding one of the given roles in an org. */
  async notifyRoles(
    organizationId: string,
    roles: string[],
    payload: Omit<CreateNotificationInput, 'organizationId' | 'userId'>,
  ) {
    const users = await this.prisma.user.findMany({
      where: { organizationId, role: { in: roles as never }, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return;
    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        organizationId,
        userId: u.id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        channel: payload.channel ?? NotifChannel.IN_APP,
      })),
    });
  }

  list(organizationId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }
}
