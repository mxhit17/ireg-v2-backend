
CREATE TABLE project_view_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL
        REFERENCES projects(id) ON DELETE CASCADE,

    -- NULL for anonymous visitors
    user_id UUID
        REFERENCES users(id) ON DELETE SET NULL,

    -- Random, app-generated visitor/session identifier
    visitor_id UUID NOT NULL,

    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Used to calculate views within time windows
CREATE INDEX idx_project_view_events_project_time
    ON project_view_events(project_id, viewed_at DESC);

-- Used to find distinct signed-in users
CREATE INDEX idx_project_view_events_user_time
    ON project_view_events(user_id, viewed_at DESC)
    WHERE user_id IS NOT NULL;

-- Used to deduplicate or analyze visitor activity
CREATE INDEX idx_project_view_events_visitor_time
    ON project_view_events(visitor_id, viewed_at DESC);



CREATE TABLE project_stats (
    project_id UUID PRIMARY KEY
        REFERENCES projects(id) ON DELETE CASCADE,

    -- Engagement in the last 30 days
    views_30d BIGINT NOT NULL DEFAULT 0,
    unique_visitors_30d BIGINT NOT NULL DEFAULT 0,
    saves_30d BIGINT NOT NULL DEFAULT 0,
    comments_30d BIGINT NOT NULL DEFAULT 0,
    rating_activity_30d BIGINT NOT NULL DEFAULT 0,

    -- Activity during the last 7 days
    engagement_7d NUMERIC(14, 2) NOT NULL DEFAULT 0,

    -- Calculated scores from 0 to 100
    views_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    unique_visitors_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    saves_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    comments_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    rating_activity_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    recent_engagement_score NUMERIC(5, 2) NOT NULL DEFAULT 0,

    popularity_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    trending_score NUMERIC(5, 2) NOT NULL DEFAULT 0,

    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_project_stats_score_range
        CHECK (
            popularity_score BETWEEN 0 AND 100
            AND trending_score BETWEEN 0 AND 100
        )
);

CREATE INDEX idx_project_stats_popularity
    ON project_stats(popularity_score DESC, project_id);

CREATE INDEX idx_project_stats_trending
    ON project_stats(trending_score DESC, project_id);



ALTER TABLE project_stats
ADD COLUMN IF NOT EXISTS engagement_previous_7d
    NUMERIC(14, 2) NOT NULL DEFAULT 0;
    
CREATE OR REPLACE FUNCTION refresh_project_stats()
RETURNS void
LANGUAGE sql
AS $$
    WITH
    bounds AS (
        SELECT NOW() AS ts
    ),

    eligible AS (
        SELECT p.id
        FROM projects p
        WHERE p.deleted_at IS NULL
    ),

    views AS (
        SELECT
            e.project_id,

            COUNT(*) FILTER (
                WHERE e.viewed_at >= b.ts - INTERVAL '30 days'
            ) AS views_30d,

            COUNT(DISTINCT
                CASE
                    WHEN e.viewed_at >= b.ts - INTERVAL '30 days'
                    THEN CASE
                        WHEN e.user_id IS NOT NULL
                            THEN 'u:' || e.user_id::text
                        ELSE 'v:' || e.visitor_id::text
                    END
                END
            ) AS unique_visitors_30d,

            COUNT(*) FILTER (
                WHERE e.viewed_at >= b.ts - INTERVAL '7 days'
            ) AS views_7d,

            COUNT(*) FILTER (
                WHERE e.viewed_at >= b.ts - INTERVAL '14 days'
                AND e.viewed_at < b.ts - INTERVAL '7 days'
            ) AS views_previous_7d

        FROM project_view_events e
        CROSS JOIN bounds b
        WHERE e.viewed_at >= b.ts - INTERVAL '30 days'
        GROUP BY e.project_id
    ),

    saves AS (
        SELECT
            s.project_id,
            COUNT(*) FILTER (
                WHERE s.created_at >= b.ts - INTERVAL '30 days'
            ) AS saves_30d,
            COUNT(*) FILTER (
                WHERE s.created_at >= b.ts - INTERVAL '7 days'
            ) AS saves_7d,
            COUNT(*) FILTER (
                WHERE s.created_at >= b.ts - INTERVAL '14 days'
                AND s.created_at < b.ts - INTERVAL '7 days'
            ) AS saves_previous_7d
        FROM saved_projects s
        CROSS JOIN bounds b
        WHERE s.created_at >= b.ts - INTERVAL '30 days'
        GROUP BY s.project_id
    ),

    comment_metrics AS (
        SELECT
            c.project_id,
            COUNT(*) FILTER (
                WHERE c.created_at >= b.ts - INTERVAL '30 days'
            ) AS comments_30d,
            COUNT(*) FILTER (
                WHERE c.created_at >= b.ts - INTERVAL '7 days'
            ) AS comments_7d,
            COUNT(*) FILTER (
                WHERE c.created_at >= b.ts - INTERVAL '14 days'
                AND c.created_at < b.ts - INTERVAL '7 days'
            ) AS comments_previous_7d
        FROM comments c
        CROSS JOIN bounds b
        WHERE c.deleted_at IS NULL
        AND c.created_at >= b.ts - INTERVAL '30 days'
        GROUP BY c.project_id
    ),

    rating_metrics AS (
        SELECT
            r.project_id,
            COUNT(*) FILTER (
                WHERE r.updated_at >= b.ts - INTERVAL '30 days'
            ) AS rating_activity_30d,
            COUNT(*) FILTER (
                WHERE r.updated_at >= b.ts - INTERVAL '7 days'
            ) AS ratings_7d,
            COUNT(*) FILTER (
                WHERE r.updated_at >= b.ts - INTERVAL '14 days'
                AND r.updated_at < b.ts - INTERVAL '7 days'
            ) AS ratings_previous_7d
        FROM project_ratings r
        CROSS JOIN bounds b
        WHERE r.updated_at >= b.ts - INTERVAL '30 days'
        GROUP BY r.project_id
    ),

    metrics AS (
        SELECT
            p.id AS project_id,

            COALESCE(v.views_30d, 0)::bigint AS views_30d,
            COALESCE(v.unique_visitors_30d, 0)::bigint
                AS unique_visitors_30d,
            COALESCE(s.saves_30d, 0)::bigint AS saves_30d,
            COALESCE(c.comments_30d, 0)::bigint AS comments_30d,
            COALESCE(r.rating_activity_30d, 0)::bigint
                AS rating_activity_30d,

            (
                COALESCE(v.views_7d, 0)
                + 3 * COALESCE(s.saves_7d, 0)
                + 2 * COALESCE(c.comments_7d, 0)
                + 2 * COALESCE(r.ratings_7d, 0)
            )::numeric AS engagement_7d,

            (
                COALESCE(v.views_previous_7d, 0)
                + 3 * COALESCE(s.saves_previous_7d, 0)
                + 2 * COALESCE(c.comments_previous_7d, 0)
                + 2 * COALESCE(r.ratings_previous_7d, 0)
            )::numeric AS engagement_previous_7d

        FROM eligible p
        LEFT JOIN views v ON v.project_id = p.id
        LEFT JOIN saves s ON s.project_id = p.id
        LEFT JOIN comment_metrics c ON c.project_id = p.id
        LEFT JOIN rating_metrics r ON r.project_id = p.id
    ),

    maxima AS (
        SELECT
            MAX(views_30d) AS max_views,
            MAX(unique_visitors_30d) AS max_visitors,
            MAX(saves_30d) AS max_saves,
            MAX(comments_30d) AS max_comments,
            MAX(rating_activity_30d) AS max_ratings,
            MAX(engagement_7d) AS max_engagement,

            MAX(
                GREATEST(
                    0,
                    (engagement_7d - engagement_previous_7d)
                    / GREATEST(engagement_previous_7d, 1)
                )
            ) AS max_growth

        FROM metrics
    ),

    normalized AS (
        SELECT
            m.*,

            CASE WHEN x.max_views > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.views_30d::numeric)
                    / LN(1 + x.max_views::numeric))
                ELSE 0 END AS views_score,

            CASE WHEN x.max_visitors > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.unique_visitors_30d::numeric)
                    / LN(1 + x.max_visitors::numeric))
                ELSE 0 END AS unique_visitors_score,

            CASE WHEN x.max_saves > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.saves_30d::numeric)
                    / LN(1 + x.max_saves::numeric))
                ELSE 0 END AS saves_score,

            CASE WHEN x.max_comments > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.comments_30d::numeric)
                    / LN(1 + x.max_comments::numeric))
                ELSE 0 END AS comments_score,

            CASE WHEN x.max_ratings > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.rating_activity_30d::numeric)
                    / LN(1 + x.max_ratings::numeric))
                ELSE 0 END AS rating_activity_score,

            CASE WHEN x.max_engagement > 0
                THEN LEAST(100.0,
                    100.0 * LN(1 + m.engagement_7d)
                    / LN(1 + x.max_engagement))
                ELSE 0 END AS recent_engagement_score,

            GREATEST(
                0,
                (m.engagement_7d - m.engagement_previous_7d)
                / GREATEST(m.engagement_previous_7d, 1)
            ) AS raw_growth,

            x.max_growth

        FROM metrics m
        CROSS JOIN maxima x
    ),

    scored AS (
        SELECT
            n.*,

            (
                0.15 * views_score
                + 0.15 * unique_visitors_score
                + 0.20 * saves_score
                + 0.20 * comments_score
                + 0.15 * rating_activity_score
                + 0.15 * recent_engagement_score
            ) AS popularity_score,

            CASE WHEN max_growth > 0
                THEN LEAST(100.0, 100.0 * raw_growth / max_growth)
                ELSE 0 END AS trending_score

        FROM normalized n
    )

    INSERT INTO project_stats (
        project_id,
        views_30d,
        unique_visitors_30d,
        saves_30d,
        comments_30d,
        rating_activity_30d,
        engagement_7d,
        engagement_previous_7d,
        views_score,
        unique_visitors_score,
        saves_score,
        comments_score,
        rating_activity_score,
        recent_engagement_score,
        popularity_score,
        trending_score,
        calculated_at
    )
    SELECT
        project_id,
        views_30d,
        unique_visitors_30d,
        saves_30d,
        comments_30d,
        rating_activity_30d,
        engagement_7d,
        engagement_previous_7d,
        views_score,
        unique_visitors_score,
        saves_score,
        comments_score,
        rating_activity_score,
        recent_engagement_score,
        ROUND(popularity_score::numeric, 2),
        ROUND(trending_score::numeric, 2),
        NOW()
    FROM scored

    ON CONFLICT (project_id) DO UPDATE SET
        views_30d = EXCLUDED.views_30d,
        unique_visitors_30d = EXCLUDED.unique_visitors_30d,
        saves_30d = EXCLUDED.saves_30d,
        comments_30d = EXCLUDED.comments_30d,
        rating_activity_30d = EXCLUDED.rating_activity_30d,
        engagement_7d = EXCLUDED.engagement_7d,
        engagement_previous_7d = EXCLUDED.engagement_previous_7d,
        views_score = EXCLUDED.views_score,
        unique_visitors_score = EXCLUDED.unique_visitors_score,
        saves_score = EXCLUDED.saves_score,
        comments_score = EXCLUDED.comments_score,
        rating_activity_score = EXCLUDED.rating_activity_score,
        recent_engagement_score = EXCLUDED.recent_engagement_score,
        popularity_score = EXCLUDED.popularity_score,
        trending_score = EXCLUDED.trending_score,
        calculated_at = NOW();
$$;
