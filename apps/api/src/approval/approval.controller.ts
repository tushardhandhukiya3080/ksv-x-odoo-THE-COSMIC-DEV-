import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Role,
  AuthUser,
  createApprovalSchema,
  approvalDecisionSchema,
  CreateApprovalInput,
  ApprovalDecisionInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApprovalService } from './approval.service';

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approval: ApprovalService) {}

  @Post()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createApprovalSchema)) dto: CreateApprovalInput,
  ) {
    return this.approval.create(user.organizationId, user.id, dto);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.APPROVER)
  pending(@CurrentUser() user: AuthUser) {
    return this.approval.listPending(user.organizationId, user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.approval.get(user.organizationId, id);
  }

  @Post(':id/decision')
  @Roles(Role.ADMIN, Role.APPROVER)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approvalDecisionSchema)) dto: ApprovalDecisionInput,
  ) {
    return this.approval.decide(user.organizationId, user.id, id, dto);
  }
}
