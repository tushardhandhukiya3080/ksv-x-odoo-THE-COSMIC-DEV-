import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { QuotationStatus, AiAnalysis } from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService, AnalyzePayload } from '../llm/llm.service';
import { QuotationService } from './quotation.service';

/**
 * AI quotation analysis (Spec §7.1). Caches by (rfqId, hash of quotations) so
 * re-opening the panel doesn't re-bill. Falls back to a deterministic ranking when
 * the LLM is unavailable — the recommendation is always advisory (officer approves).
 */
@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly quotation: QuotationService,
  ) {}

  async analyze(organizationId: string, rfqId: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: rfqId, organizationId },
      include: { items: true },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const quotations = await this.prisma.quotation.findMany({
      where: { rfqId, status: QuotationStatus.SUBMITTED },
      include: { items: true, vendor: { select: { name: true, rating: true } } },
    });
    if (quotations.length === 0) {
      return { source: 'none', analysis: emptyAnalysis(), cached: false };
    }

    const quotationsHash = hashQuotations(quotations);

    // Cache hit?
    const cached = await this.prisma.quotationAnalysis.findUnique({
      where: { rfqId_quotationsHash: { rfqId, quotationsHash } },
    });
    if (cached) {
      return {
        source: cached.model,
        cached: true,
        analysis: {
          recommendedQuotationId: cached.recommendedQuotationId,
          summary: cached.summary,
          ranking: (cached.reasoningJson as { ranking: AiAnalysis['ranking'] }).ranking ?? [],
          riskFlags: (cached.riskFlagsJson as AiAnalysis['riskFlags']) ?? [],
        } satisfies AiAnalysis,
      };
    }

    const deadlineDays = Math.max(
      1,
      Math.ceil((rfq.deadline.getTime() - Date.now()) / 86_400_000),
    );
    const payload: AnalyzePayload = {
      rfq: {
        title: rfq.title,
        deadlineDays,
        items: rfq.items.map((i) => ({ name: i.name, qty: i.quantity, unit: i.unit })),
      },
      quotations: quotations.map((q) => ({
        quotationId: q.id,
        vendor: q.vendor.name,
        rating: q.vendor.rating,
        deliveryDays: q.deliveryDays,
        currency: q.currency,
        total: Number(q.totalAmount),
        notes: q.notes,
        items: q.items.map((it) => ({
          name: it.rfqItemId,
          unitPrice: Number(it.unitPrice),
          qty: it.quantity,
          lineTotal: Number(it.lineTotal),
        })),
      })),
    };

    let analysis: AiAnalysis;
    let model: string;
    try {
      analysis = await this.llm.analyze(payload);
      model = this.llm.model;
    } catch {
      analysis = await this.deterministicAnalysis(organizationId, rfqId);
      model = 'deterministic-fallback';
    }

    await this.prisma.quotationAnalysis.create({
      data: {
        rfqId,
        recommendedQuotationId: analysis.recommendedQuotationId,
        summary: analysis.summary,
        reasoningJson: { ranking: analysis.ranking },
        riskFlagsJson: analysis.riskFlags,
        model,
        quotationsHash,
      },
    });

    return { source: model, cached: false, analysis };
  }

  private async deterministicAnalysis(organizationId: string, rfqId: string): Promise<AiAnalysis> {
    const { recommendedQuotationId, ranking } =
      await this.quotation.deterministicRecommendation(organizationId, rfqId);
    const top = ranking[0];
    return {
      recommendedQuotationId,
      summary: top
        ? `Deterministic recommendation: the highest weighted score balances price (50%), delivery (30%) and vendor rating (20%). Top quotation scores ${top.score}. (LLM offline — advisory baseline.)`
        : 'No submitted quotations to analyze.',
      ranking,
      riskFlags: [],
    };
  }
}

function hashQuotations(
  quotations: { id: string; totalAmount: unknown; deliveryDays: number; status: string }[],
): string {
  const canonical = quotations
    .map((q) => `${q.id}:${String(q.totalAmount)}:${q.deliveryDays}:${q.status}`)
    .sort()
    .join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

function emptyAnalysis(): AiAnalysis {
  return { recommendedQuotationId: null, summary: 'No quotations yet.', ranking: [], riskFlags: [] };
}
