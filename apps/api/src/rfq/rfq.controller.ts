import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Role,
  AuthUser,
  RfqStatus,
  createRfqSchema,
  updateRfqSchema,
  inviteVendorsSchema,
  CreateRfqInput,
  UpdateRfqInput,
  InviteVendorsInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RfqService } from './rfq.service';

@ApiTags('rfqs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rfqs')
export class RfqController {
  constructor(private readonly rfq: RfqService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RfqStatus) {
    return this.rfq.list(user.organizationId, status);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rfq.get(user.organizationId, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRfqSchema)) dto: CreateRfqInput,
  ) {
    return this.rfq.create(user.organizationId, user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRfqSchema)) dto: UpdateRfqInput,
  ) {
    return this.rfq.update(user.organizationId, user.id, id, dto);
  }

  @Post(':id/invite')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inviteVendorsSchema)) dto: InviteVendorsInput,
  ) {
    return this.rfq.invite(user.organizationId, user.id, id, dto.vendorIds);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rfq.close(user.organizationId, user.id, id);
  }
}
