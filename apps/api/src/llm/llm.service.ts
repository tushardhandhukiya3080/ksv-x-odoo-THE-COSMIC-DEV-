import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { aiAnalysisSchema, AiAnalysis } from '@vendorbridge/shared';

export interface AnalyzePayload {
  rfq: { title: string; deadlineDays: number; items: { name: string; qty: number; unit: string }[] };
  quotations: Array<{
    quotationId: string;
    vendor: string;
    rating: number;
    deliveryDays: number;
    currency: string;
    items: { name: string; unitPrice: number; qty: number; lineTotal: number }[];
    total: number;
    notes?: string | null;
  }>;
}

const SYSTEM_PROMPT = `You are a procurement analyst. Given an RFQ and competing vendor quotations,
recommend the best vendor. Weigh price, delivery time, vendor rating, and stated
terms — not price alone. Flag anomalies (outlier prices, missing items, unusually
long delivery). Respond ONLY with valid JSON matching the schema. No prose outside JSON.`;

/**
 * The single place that talks to the LLM (Spec §7.1). Keeps the API key server-side
 * and lets us swap providers in one file. Throws LlmUnavailableError when not configured
 * or unreachable so callers can fall back deterministically.
 */
export class LlmUnavailableError extends Error {}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('llm.apiKey'));
  }

  get model(): string {
    return this.config.get<string>('llm.model') ?? 'unknown';
  }

  async analyze(payload: AnalyzePayload): Promise<AiAnalysis> {
    if (!this.isConfigured) {
      throw new LlmUnavailableError('LLM is not configured');
    }
    const provider = this.config.get<string>('llm.provider');
    try {
      const raw =
        provider === 'openai'
          ? await this.callOpenAi(payload)
          : await this.callAnthropic(payload);
      const parsed = JSON.parse(this.extractJson(raw));
      return aiAnalysisSchema.parse(parsed);
    } catch (err) {
      this.logger.warn(`LLM analyze failed: ${(err as Error).message}`);
      throw new LlmUnavailableError((err as Error).message);
    }
  }

  private async callAnthropic(payload: AnalyzePayload): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.get<string>('llm.apiKey')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content: { text: string }[] };
    return data.content?.[0]?.text ?? '';
  }

  private async callOpenAi(payload: AnalyzePayload): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.get<string>('llm.apiKey')}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }

  private extractJson(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found in LLM response');
    return text.slice(start, end + 1);
  }
}
