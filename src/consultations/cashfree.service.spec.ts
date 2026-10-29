import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { CashfreeService } from './cashfree.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('CashfreeService', () => {
  const secret = 'test-webhook-secret';
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        CASHFREE_ENV: 'sandbox',
        CASHFREE_CLIENT_ID: 'sandbox-app-id',
        CASHFREE_CLIENT_SECRET: 'sandbox-app-secret',
        CASHFREE_WEBHOOK_SECRET: secret,
        CASHFREE_API_BASE_URL: process.env.CASHFREE_API_BASE_URL ?? '',
      };
      return values[key] ?? fallback;
    }),
  } as unknown as ConfigService;
  let service: CashfreeService;

  beforeEach(() => {
    service = new CashfreeService(config);
  });

  it('verifies Cashfree signature over timestamp followed by the raw body', () => {
    const timestamp = '1782641000';
    const body = Buffer.from('{"type":"PAYMENT_SUCCESS_WEBHOOK"}');
    const signature = createHmac('sha256', secret)
      .update(timestamp)
      .update(body)
      .digest('base64');

    expect(() =>
      service.verifyWebhook(body, signature, timestamp),
    ).not.toThrow();
    expect(() =>
      service.verifyWebhook(Buffer.from('{}'), signature, timestamp),
    ).toThrow(UnauthorizedException);
  });

  it('creates Cashfree orders through the sandbox API with server-side amount and idempotency', async () => {
    const responseBody = {
      order_id: 'ireg_abc123',
      order_amount: 1250,
      order_currency: 'INR',
      order_status: 'ACTIVE',
      payment_session_id: 'session_test',
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      );

    await expect(
      service.createOrder({
        orderId: 'ireg_abc123',
        idempotencyKey: '3bd7e870-59e9-4b08-9ef4-0b8ba5a19505',
        amount: 1250,
        currency: 'INR',
        customerId: 'user-1',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9876543210',
        returnUrl: 'https://app.example.com/payment-return',
      }),
    ).resolves.toEqual(responseBody);

    const expectedBaseUrl =
      process.env.CASHFREE_API_BASE_URL || 'https://sandbox.cashfree.com/pg';
    expect(fetchSpy).toHaveBeenCalledWith(
      `${expectedBaseUrl}/orders`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-version': '2026-01-01',
          'x-client-id': 'sandbox-app-id',
          'x-idempotency-key': '3bd7e870-59e9-4b08-9ef4-0b8ba5a19505',
        }),
      }),
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toMatchObject(
      {
        order_id: 'ireg_abc123',
        order_amount: 1250,
        order_currency: 'INR',
      },
    );
    fetchSpy.mockRestore();
  });

  const simulationTest = process.env.CASHFREE_API_BASE_URL ? it : it.skip;
  simulationTest(
    'runs create and fetch order calls through Cashfree PG simulation',
    async () => {
      const created = await service.createOrder({
        orderId: 'ireg_mockorder',
        idempotencyKey: '3bd7e870-59e9-4b08-9ef4-0b8ba5a19505',
        amount: 1250,
        currency: 'INR',
        customerId: 'user-1',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        customerPhone: '9876543210',
        returnUrl: 'https://app.example.com/payment-return',
      });
      const fetched = await service.getOrder('ireg_mockorder');

      expect(created.payment_session_id).toBe('session_sandbox_mock');
      expect(fetched.order_status).toBe('ACTIVE');
    },
  );
});
