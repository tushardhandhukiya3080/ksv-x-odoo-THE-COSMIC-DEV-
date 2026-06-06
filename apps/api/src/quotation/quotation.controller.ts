import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, AuthUser } from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QuotationService } from './quotation.service';
import { AiAnalysisService } from './ai-analysis.service';

@ApiTags('quotations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rfqs')
export class QuotationController {
  constructor(
    private readonly quotation: QuotationService,
    private readonly aiAnalysis: AiAnalysisService,
  ) {}

  @Get(':id/comparison')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  comparison(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotation.comparison(user.organizationId, id);
  }

  @Post(':id/ai-analysis')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  aiAnalysisRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiAnalysis.analyze(user.organizationId, id);
  }
}
