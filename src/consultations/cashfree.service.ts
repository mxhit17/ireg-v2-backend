import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const CASHFREE_API_VERSION = '2026-01-01';

type CashfreeOrder = {
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
};

@Injectable()
export class CashfreeService {
  constructor(private readonly config: ConfigService) {}

  verifyWebhook(
    rawBody: Buffer | undefined,
    signature?: string,
    timestamp?: string,
  ) {
    const secret = this.config.get<string>('CASHFREE_WEBHOOK_SECRET');
    if (!secret || !rawBody || !signature || !timestamp) {
      throw new UnauthorizedException(
        'Cashfree webhook signature is missing or not configured.',
      );
    }

    const expected = createHmac('sha256', secret)
      .update(timestamp)
      .update(rawBody)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64');
    } catch {
      throw new UnauthorizedException('Invalid Cashfree webhook signature.');
    }
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException('Invalid Cashfree webhook signature.');
    }
  }

  async createOrder(input: {
    orderId: string;
    idempotencyKey: string;
    amount: number;
    currency: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string | null;
    returnUrl: string;
    notifyUrl?: string;
  }): Promise<CashfreeOrder> {
    const response = await this.request<CashfreeOrder>('/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        order_id: input.orderId,
        order_amount: input.amount,
        order_currency: input.currency,
        customer_details: {
          customer_id: input.customerId,
          customer_name: input.customerName,
          customer_email: input.customerEmail,
          ...(input.customerPhone && { customer_phone: input.customerPhone }),
        },
        order_meta: {
          return_url: input.returnUrl,
          ...(input.notifyUrl && { notify_url: input.notifyUrl }),
        },
        order_note: `IREG consultation ${input.orderId}`,
      }),
    });
    return response;
  }

  getOrder(orderId: string) {
    return this.request<CashfreeOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
      },
    );
  }

  getEnvironment() {
    return this.config.get<string>('CASHFREE_ENV', 'sandbox') ?? 'sandbox';
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const clientId = this.config.get<string>('CASHFREE_CLIENT_ID');
    const clientSecret = this.config.get<string>('CASHFREE_CLIENT_SECRET');
    const environment = this.getEnvironment();
    if (
      !clientId ||
      !clientSecret ||
      !['sandbox', 'production'].includes(environment)
    ) {
      throw new ServiceUnavailableException(
        'Cashfree payments are not configured. Set Cashfree sandbox credentials to enable checkout.',
      );
    }
    const baseUrl =
      this.config.get<string>('CASHFREE_API_BASE_URL') &&
      environment === 'sandbox' &&
      process.env.NODE_ENV === 'test'
        ? this.config.get<string>('CASHFREE_API_BASE_URL')!.replace(/\/$/, '')
        : environment === 'production'
          ? 'https://api.cashfree.com/pg'
          : 'https://sandbox.cashfree.com/pg';
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(15000),
        headers: {
          'x-api-version': CASHFREE_API_VERSION,
          'x-client-id': clientId,
          'x-client-secret': clientSecret,
          accept: 'application/json',
          ...(init.body && { 'content-type': 'application/json' }),
          ...init.headers,
        },
      });
      if (!response.ok) {
        // Do not forward provider error bodies; they can contain sensitive request data.
        throw new ServiceUnavailableException(
          `Cashfree request failed with status ${response.status}.`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Cashfree could not be reached. Please retry.',
      );
    }
  }
}
