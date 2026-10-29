ALTER TABLE blogs
ADD COLUMN cover_image_public_id VARCHAR(500);


INSERT INTO consultation_services (
    id,
    name,
    slug,
    description,
    price,
    currency,
    duration_days,
    is_active,
    created_at,
    updated_at
)
VALUES
(
    gen_random_uuid(),
    'Chartered Accountant',
    'chartered-accountant',
    'Get professional guidance from a Chartered Accountant on property taxation, capital gains tax, tax implications of real estate investments, TDS on property transactions, and related financial matters.',
    1499.00,
    'INR',
    7,
    TRUE,
    NOW(),
    NOW()
),
(
    gen_random_uuid(),
    'Lawyer',
    'lawyer',
    'Consult a legal professional for guidance on property documentation, sale and purchase agreements, title verification, property disputes, RERA-related matters, and other real estate legal concerns.',
    1999.00,
    'INR',
    7,
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    duration_days = EXCLUDED.duration_days,
    updated_at = NOW();


ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(45) UNIQUE,
ADD COLUMN IF NOT EXISTS cashfree_payment_session_id TEXT,
ADD COLUMN IF NOT EXISTS cashfree_payment_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ(6);