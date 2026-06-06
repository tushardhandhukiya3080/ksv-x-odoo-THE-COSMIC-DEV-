import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Role,
  AuthUser,
  tradeProfileSchema,
  tradeConnectionSchema,
  respondConnectionSchema,
  listingSchema,
  TradeProfileInput,
  TradeConnectionInput,
  RespondConnectionInput,
  ListingInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TradeService } from './trade.service';

@ApiTags('trade')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade')
export class TradeController {
  constructor(private readonly trade: TradeService) {}

  @Get('profile')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  getProfile(@CurrentUser() user: AuthUser) {
    return this.trade.getProfile(user.organizationId);
  }

  @Put('profile')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tradeProfileSchema)) dto: TradeProfileInput,
  ) {
    return this.trade.upsertProfile(user.organizationId, dto);
  }

  @Get('organizations')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  organizations(@CurrentUser() user: AuthUser) {
    return this.trade.organizations(user.organizationId);
  }

  @Get('connections')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  connections(@CurrentUser() user: AuthUser) {
    return this.trade.listConnections(user.organizationId);
  }

  @Post('connections')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  requestConnection(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tradeConnectionSchema)) dto: TradeConnectionInput,
  ) {
    return this.trade.requestConnection(user.organizationId, dto);
  }

  @Post('connections/:id/respond')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  respond(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(respondConnectionSchema)) dto: RespondConnectionInput,
  ) {
    return this.trade.respondConnection(user.organizationId, id, dto.accept);
  }

  @Get('listings')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  listMine(@CurrentUser() user: AuthUser) {
    return this.trade.listMine(user.organizationId);
  }

  @Post('listings')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  createListing(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(listingSchema)) dto: ListingInput,
  ) {
    return this.trade.createListing(user.organizationId, dto);
  }

  @Delete('listings/:id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  deleteListing(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trade.deleteListing(user.organizationId, id);
  }

  @Get('marketplace')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  marketplace(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.trade.marketplace(user.organizationId, q);
  }
}
