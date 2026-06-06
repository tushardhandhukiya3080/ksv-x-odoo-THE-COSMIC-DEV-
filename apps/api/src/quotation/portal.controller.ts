import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createQuotationSchema, CreateQuotationInput } from '@vendorbridge/shared';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QuotationService } from './quotation.service';

/**
 * Vendor portal (Spec §6.5) — token-authenticated, no JWT.
 * The invitation token scopes access to a single RFQ + vendor.
 */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly quotation: QuotationService) {}

  @Public()
  @Get('rfqs/:token')
  getRfq(@Param('token') token: string) {
    return this.quotation.getPortalRfq(token);
  }

  @Public()
  @Post('quotations')
  saveDraft(@Body(new ZodValidationPipe(createQuotationSchema)) dto: CreateQuotationInput) {
    return this.quotation.createDraft(dto);
  }

  @Public()
  @Post('quotations/:id/submit')
  submit(@Param('id') id: string, @Body('token') token: string) {
    return this.quotation.submit(token, id);
  }
}
