import { Injectable, Logger } from '@nestjs/common';

/**
 * HTML → PDF via Puppeteer (Spec §6.8). Chromium is launched lazily and reused.
 * Degrades gracefully: if Chromium is unavailable, callers can fall back to serving
 * the HTML directly so the demo never hard-fails offline.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private browserPromise: Promise<import('puppeteer').Browser> | null = null;

  private async getBrowser() {
    if (!this.browserPromise) {
      const puppeteer = await import('puppeteer');
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  /** Returns a PDF buffer, or null if rendering is unavailable (caller falls back to HTML). */
  async renderToPdf(html: string): Promise<Buffer | null> {
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        });
        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    } catch (err) {
      this.logger.warn(`PDF render unavailable, falling back to HTML: ${(err as Error).message}`);
      this.browserPromise = null;
      return null;
    }
  }
}
