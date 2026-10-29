# Cashfree sandbox simulation

Generated 2026-10-28. This local simulation uses a mock generated from `postman/specs/cashfree-pg.yaml`, which models the Cashfree order creation and fetch operations used in `src/consultations/cashfree.service.ts`. The provider workspace search was skipped because Postman CLI had no login credentials; the contract subset was based on Cashfree's public API reference.

## Purpose

Run IREG's real Cashfree HTTP client against the documented sandbox order API shape without credentials or real payment side effects.

## Execution

1. Start: `/Users/mohitmudgal/.local/bin/postman simulation run postman/simulations/cashfree-sandbox/cashfree-sandbox.sim.yaml --port 4900 --output ndjson`
2. Exercise: `CASHFREE_API_BASE_URL=http://127.0.0.1:4900/cashfree/pg NODE_ENV=test npx jest --runInBand src/consultations/cashfree.service.spec.ts`
3. Stop with Ctrl-C. The client test must complete while the simulation is listening; read its request log before stopping.

## Assumptions

- **The generated mock's order response fields match Cashfree's current `2026-01-01` API version.** The client uses those fields to return a session and check status. (reasoned 2026-10-28, `postman/specs/cashfree-pg.yaml` and Cashfree's public Create Order/Get Order API references)
- **The simulation does not model actual payment completion, signature creation, or provider account settings.** A pass establishes request/response wiring only; those behaviors still require Cashfree sandbox credentials and a reachable webhook URL. (observed 2026-10-28)

## Observations

<!-- begin:observations -->

2026-10-28: the `cashfree` member served `POST /pg/orders` and `GET /pg/orders/ireg_mockorder`; both returned HTTP 200, and the logged create body contained the expected amount, currency, customer details, callback URL, and idempotency key.
<!-- end:observations -->

## What didn't work

- 2026-10-28: the first simulation startup returned `listen EPERM`; the environment denied loopback port binding. Retrying with local network permission let the simulation start and the client reach it.
