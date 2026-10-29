# Cashfree consultation payments

The backend creates Cashfree orders from the consultation's server-side price. The response includes `payment_session_id` and `environment` for the web or mobile client to open Cashfree Checkout. The client must then call `GET /api/consultations/:id/payment-status` after checkout; the return redirect itself never marks a consultation paid. A signed Cashfree webhook also confirms successful payments.

## Sandbox setup

1. Create or use a Cashfree merchant account and enable Payment Gateway sandbox access. Create sandbox App ID and Secret Key credentials.
2. Copy `.env.example` to `.env` and set `CASHFREE_ENV=sandbox`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, and `CASHFREE_WEBHOOK_SECRET` from the Cashfree dashboard. The customer profile must have a phone number before starting checkout.
3. Set `CASHFREE_RETURN_URL` to a frontend page that can show the checkout result. It must use the same origin as any `return_url` sent in `POST /api/consultations/:id/payment`.
4. Configure the Cashfree webhook URL as `https://<public-api-host>/api/payments/webhook` in Cashfree dashboard, subscribe to payment success and failure events, and use the webhook secret configured for that endpoint. A local API needs a public HTTPS tunnel for Cashfree to deliver events.
5. Apply the migration and start the backend:

   ```sh
   npx prisma migrate deploy
   npm run start:dev
   ```

6. Create a consultation as an authenticated user, then call `POST /api/consultations/:id/payment` with `{}`. Open the returned `payment_session_id` using Cashfree's web or mobile SDK with the returned environment (`sandbox`). After checkout, poll `GET /api/consultations/:id/payment-status` or wait for the webhook. Only the server-verified Cashfree `PAID` order state changes the consultation to `PAID`.

For a web frontend, Cashfree's hosted checkout integration follows this shape:

```ts
const response = await fetch(`/api/consultations/${consultationId}/payment`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
});
const { payment_session_id, environment } = await response.json();
const cashfree = Cashfree({ mode: environment });
await cashfree.checkout({
  paymentSessionId: payment_session_id,
  redirectTarget: '_self',
});
```

Load Cashfree's hosted JS SDK from `https://sdk.cashfree.com/js/v3/cashfree.js`. On the configured return page, read `consultation_id` from the URL and call the authenticated payment-status endpoint; display success only when its response says `PAID`.

Cashfree's sandbox API is `https://sandbox.cashfree.com/pg`; production uses `https://api.cashfree.com/pg`. Keep production and sandbox credentials separate. Never expose either API secret or webhook secret to the frontend or commit them to source control.

## Production readiness

- Complete Cashfree merchant onboarding and use production App ID/Secret Key and webhook secret. Set `CASHFREE_ENV=production`; do not change code to switch environments.
- Deploy the API behind HTTPS and register the public webhook URL in Cashfree. Confirm raw request bytes reach NestJS unchanged (`rawBody` is enabled in `src/main.ts`).
- Set `CASHFREE_RETURN_URL` to the real frontend URL and verify the frontend opens the Cashfree checkout SDK with `payment_session_id` and the matching environment.
- Apply migrations before deploying the new backend. Keep webhook delivery enabled and monitor non-2xx webhook responses, API errors, payment-to-consultation reconciliation, refunds, and disputes in the Cashfree dashboard.
- Run sandbox success, failure, cancellation, repeated webhook, invalid signature, amount/currency mismatch, retry, and dropped-return-page scenarios before go-live. Verify that only a successful, server-confirmed order unlocks consultation assignment.
- Rotate credentials, restrict access to deployment secrets, use distinct sandbox and production webhook secrets, and confirm Cashfree account settings, enabled payment methods, settlement bank account, customer support/refund policy, and applicable tax/accounting requirements before accepting live payments.

## API contract

- `POST /api/consultations/:id/payment` (JWT): creates or resumes the consultation's Cashfree order; returns `consultation_id`, `order_id`, `amount`, `currency`, `payment_session_id`, and `environment`.
- `GET /api/consultations/:id/payment-status` (JWT): verifies the order with Cashfree and returns local consultation status plus Cashfree order status.
- `POST /api/payments/webhook` (public): verifies `x-webhook-timestamp` and `x-webhook-signature` against Cashfree's `timestamp + raw body` HMAC-SHA256 base64 signature before processing an event.
