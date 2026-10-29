ALTER TABLE "consultations"
  ADD COLUMN "cashfree_order_id" VARCHAR(45),
  ADD COLUMN "cashfree_payment_session_id" TEXT,
  ADD COLUMN "cashfree_payment_id" VARCHAR(100),
  ADD COLUMN "payment_verified_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "consultations_cashfree_order_id_key"
  ON "consultations"("cashfree_order_id");
