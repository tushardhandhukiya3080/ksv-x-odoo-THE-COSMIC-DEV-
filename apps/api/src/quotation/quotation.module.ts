import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';
import { PortalController } from './portal.controller';
import { AiAnalysisService } from './ai-analysis.service';

@Module({
  controllers: [QuotationController, PortalController],
  providers: [QuotationService, AiAnalysisService],
  exports: [QuotationService],
})
export class QuotationModule {}
