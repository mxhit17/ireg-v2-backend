CREATE TABLE pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email VARCHAR(320) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    password_hash TEXT NOT NULL,
    otp_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ(6) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pending_registrations_expires_at
    ON pending_registrations (expires_at);