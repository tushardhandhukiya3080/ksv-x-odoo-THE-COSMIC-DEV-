import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LlmModule } from './llm/llm.module';
import { DocumentsModule } from './documents/documents.module';
import { EventsModule } from './events/events.module';
import { N8nModule } from './n8n/n8n.module';
import { AuthModule } from './auth/auth.module';
import { VendorsModule } from './vendors/vendors.module';
import { RfqModule } from './rfq/rfq.module';
import { QuotationModule } from './quotation/quotation.module';
import { ApprovalModule } from './approval/approval.module';
import { PurchaseOrderModule } from './purchase-order/purchase-order.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PaymentModule } from './payment/payment.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { ShipmentModule } from './shipment/shipment.module';
import { TradeModule } from './trade/trade.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // Root .env is the source of truth for the whole monorepo.
      envFilePath: [join(process.cwd(), '../../.env'), join(process.cwd(), '.env')],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    // Global infrastructure
    PrismaModule,
    EventsModule,
    N8nModule,
    AuditModule,
    NotificationsModule,
    LlmModule,
    DocumentsModule,

    // Domain modules (Phase 1)
    AuthModule,
    VendorsModule,
    RfqModule,
    QuotationModule,
    ApprovalModule,
    PurchaseOrderModule,
    InvoiceModule,
    PaymentModule,
    DashboardModule,
    ReportsModule,
    UsersModule,
    ShipmentModule,
    TradeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
