import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Role,
  AuthUser,
  createShipmentSchema,
  shipmentEventSchema,
  CreateShipmentInput,
  ShipmentEventInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ShipmentService } from './shipment.service';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shipments')
export class ShipmentController {
  constructor(private readonly shipment: ShipmentService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  list(@CurrentUser() user: AuthUser) {
    return this.shipment.list(user.organizationId);
  }

  @Get('geocode')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  geocode(@Query('q') q: string) {
    return this.shipment.geocode(q ?? '');
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shipment.get(user.organizationId, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createShipmentSchema)) dto: CreateShipmentInput,
  ) {
    return this.shipment.create(user.organizationId, user.id, dto);
  }

  @Post(':id/events')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  addEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shipmentEventSchema)) dto: ShipmentEventInput,
  ) {
    return this.shipment.addEvent(user.organizationId, user.id, id, dto);
  }
}
