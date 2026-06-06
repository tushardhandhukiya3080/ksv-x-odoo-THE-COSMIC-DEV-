import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EventsService } from './events.service';
import { EventsGateway } from './events.gateway';

@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [EventsService, EventsGateway],
  exports: [EventsService],
})
export class EventsModule {}
