import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role, AuthUser, createInvoiceSchema, CreateInvoiceInput } from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InvoiceService } from './invoice.service';
import { PaymentService } from '../payment/payment.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoice: InvoiceService,
    private readonly payment: PaymentService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  list(@CurrentUser() user: AuthUser) {
    return this.invoice.list(user.organizationId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoice.get(user.organizationId, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceInput,
  ) {
    return this.invoice.create(user.organizationId, user.id, dto.poId, dto.dueInDays);
  }

  @Post(':id/send')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoice.send(user.organizationId, user.id, id);
  }

  @Post(':id/pay')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payment.createOrder(user.organizationId, id);
  }

  @Get(':id/pdf')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const doc = await this.invoice.document(user.organizationId, id);
    if (doc.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.invoiceNumber}.pdf"`);
      return res.send(doc.pdf);
    }
    res.setHeader('Content-Type', 'text/html');
    return res.send(doc.html);
  }
}
