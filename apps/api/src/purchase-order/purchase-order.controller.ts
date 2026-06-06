import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import {
  Role,
  AuthUser,
  PoStatus,
  createPoSchema,
  CreatePoInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PurchaseOrderService } from './purchase-order.service';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly po: PurchaseOrderService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  list(@CurrentUser() user: AuthUser) {
    return this.po.list(user.organizationId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.po.get(user.organizationId, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPoSchema)) dto: CreatePoInput,
  ) {
    return this.po.create(user.organizationId, user.id, dto.quotationId);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('status') status: PoStatus,
  ) {
    return this.po.updateStatus(user.organizationId, user.id, id, status);
  }

  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const doc = await this.po.document(user.organizationId, id);
    if (doc.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.poNumber}.pdf"`);
      return res.send(doc.pdf);
    }
    res.setHeader('Content-Type', 'text/html');
    return res.send(doc.html);
  }
}
