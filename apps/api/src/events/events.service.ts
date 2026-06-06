import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Thin emitter over the Socket.io server (Spec §7.3). The gateway binds the server
 * instance here so any provider can emit without depending on the gateway directly.
 * Rooms: org:{orgId}, user:{userId}, role:{orgId}:{role}.
 */
@Injectable()
export class EventsService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  emitToOrg(orgId: string, event: string, payload: unknown = {}) {
    this.server?.to(`org:${orgId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown = {}) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRole(orgId: string, role: string, event: string, payload: unknown = {}) {
    this.server?.to(`role:${orgId}:${role}`).emit(event, payload);
  }
}
