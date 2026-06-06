import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { InvoiceStatus, PaymentStatus } from '@vendorbridge/shared';
import { Prisma } from '@vendorbridge/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Razorpay payments (Spec §7.8). Server-side order creation; webhook signature
 * verification before marking PAID; idempotent on razorpayPaymentId. Degrades to a
 * simulated order when keys are absent so the demo flow still works offline.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private get keyId() {
    return this.config.get<string>('razorpay.keyId') ?? '';
  }
  private get keySecret() {
    return this.config.get<string>('razorpay.keySecret') ?? '';
  }
  private get webhookSecret() {
    return this.config.get<string>('razorpay.webhookSecret') ?? '';
  }

  async createOrder(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    const amount = Number(invoice.grandTotal);
    const configured = Boolean(this.keyId && this.keySecret);

    let razorpayOrderId: string;
    if (configured) {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // paise
          currency: invoice.currency,
          receipt: invoice.invoiceNumber,
          notes: { invoiceId },
        }),
      });
      if (!res.ok) throw new BadRequestException('Failed to create Razorpay order');
      const data = (await res.json()) as { id: string };
      razorpayOrderId = data.id;
    } else {
      razorpayOrderId = `order_sim_${Date.now()}`;
      this.logger.warn('Razorpay not configured — created a simulated order for the demo.');
    }

    await this.prisma.payment.create({
      data: {
        invoiceId,
        provider: 'razorpay',
        razorpayOrderId,
        amount: new Prisma.Decimal(amount),
        currency: invoice.currency,
        status: PaymentStatus.CREATED,
      },
    });

    return {
      orderId: razorpayOrderId,
      amount: Math.round(amount * 100),
      currency: invoice.currency,
      keyId: this.keyId,
      simulated: !configured,
    };
  }

  /** Webhook handler: verify HMAC signature, then mark PAID idempotently (Spec §7.8). */
  async handleWebhook(signature: string, rawBody: Buffer) {
    if (this.webhookSecret) {
      const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      if (expected !== signature) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }
    const event = JSON.parse(rawBody.toString('utf8'));
    const entity = event?.payload?.payment?.entity;
    if (!entity) return { ok: true, ignored: true };

    const { id: razorpayPaymentId, order_id: razorpayOrderId } = entity;

    // Idempotent: skip if we already recorded this payment id as PAID.
    const already = await this.prisma.payment.findUnique({ where: { razorpayPaymentId } });
    if (already && already.status === PaymentStatus.PAID) return { ok: true, duplicate: true };

    const payment = await this.prisma.payment.findFirst({
      where: { razorpayOrderId },
      include: { invoice: true },
    });
    if (!payment) return { ok: true, ignored: true };

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { razorpayPaymentId, status: PaymentStatus.PAID, rawWebhookJson: event },
      }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: InvoiceStatus.PAID },
      }),
    ]);

    await this.audit.log({
      organizationId: payment.invoice.organizationId,
      actorId: null,
      action: 'INVOICE_PAID',
      entityType: 'Invoice',
      entityId: payment.invoiceId,
      metadata: { razorpayPaymentId, amount: String(payment.amount) },
    });
    return { ok: true };
  }
}
