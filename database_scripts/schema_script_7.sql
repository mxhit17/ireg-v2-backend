-- =============================================================================
-- schema_script_7.sql — App feedback
--
-- Stores "How likely are you to recommend us?" feedback from signed-in users:
-- a 1–10 rating plus an optional free-text message. Users may submit more than
-- once (each submission is a new row), so trends over time are kept.
--
-- Safe to re-run: every statement is idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback (
    id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
    user_id     uuid                     NOT NULL,
    rating      smallint                 NOT NULL,
    message     text,
    created_at  timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT feedback_pkey PRIMARY KEY (id),
    CONSTRAINT fk_feedback_user FOREIGN KEY (user_id)
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 10),
    -- NULL = no message; an empty / whitespace-only string is not allowed.
    CONSTRAINT chk_feedback_message CHECK (
        message IS NULL
        OR (length(TRIM(BOTH FROM message)) > 0 AND length(message) <= 2000)
    )
);

-- "My latest feedback" lookups.
CREATE INDEX IF NOT EXISTS idx_feedback_user_created
    ON public.feedback USING btree (user_id, created_at DESC);

-- Admin list, newest first.
CREATE INDEX IF NOT EXISTS idx_feedback_created
    ON public.feedback USING btree (created_at DESC);

-- Admin filter / distribution by score.
CREATE INDEX IF NOT EXISTS idx_feedback_rating
    ON public.feedback USING btree (rating);

COMMENT ON TABLE  public.feedback IS 'App feedback: 1–10 recommendation rating with an optional message.';
COMMENT ON COLUMN public.feedback.rating  IS 'How likely the user is to recommend IREG, 1 (not likely) to 10 (very likely).';
COMMENT ON COLUMN public.feedback.message IS 'Optional free text, max 2000 characters.';

COMMIT;
