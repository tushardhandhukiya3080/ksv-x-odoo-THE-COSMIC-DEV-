import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

/**
 * Outbound webhooks to n8n (Spec §7.5). Sends a signed `{ type, to, templateData }`
 * payload that n8n workflows turn into email / WhatsApp. Fire-and-forget and never
 * throws — if n8n is unreachable the core request is unaffected (graceful degrade).
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('n8n.webhookUrl'));
  }

  /** Non-blocking dispatch. Call without awaiting from request handlers. */
  dispatch(type: string, templateData: Record<string, unknown>, to?: string | null) {
    if (!this.isConfigured) return;
    void this.post({ type, to: to ?? null, templateData, sentAt: new Date().toISOString() });
  }

  private async post(body: Record<string, unknown>) {
    const url = this.config.get<string>('n8n.webhookUrl')!;
    const secret = this.config.get<string>('n8n.webhookSecret') ?? '';
    const raw = JSON.stringify(body);
    const signature = secret ? createHmac('sha256', secret).update(raw).digest('hex') : '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vb-signature': signature },
        body: raw,
        signal: controller.signal,
      });
      if (!res.ok) this.logger.warn(`n8n webhook "${body.type}" -> HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`n8n webhook "${body.type}" failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
