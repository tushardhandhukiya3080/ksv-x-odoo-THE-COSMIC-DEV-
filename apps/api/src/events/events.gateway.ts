import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtPayload } from '@vendorbridge/shared';
import { EventsService } from './events.service';

/**
 * Socket.io gateway (Spec §7.3). Authenticates each socket with the JWT on connect
 * and joins it to its org / user / role rooms. Disconnects unauthenticated sockets.
 */
@WebSocketGateway({
  cors: { origin: (process.env.APP_URL ?? 'http://localhost:3000').split(','), credentials: true },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
  ) {}

  afterInit(server: Server) {
    this.events.bind(server);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.join(`org:${payload.organizationId}`);
      client.join(`user:${payload.sub}`);
      client.join(`role:${payload.organizationId}:${payload.role}`);
    } catch {
      client.disconnect(true);
    }
  }
}
