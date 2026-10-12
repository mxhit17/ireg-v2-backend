-- ============================================================
-- IREG - Indian Real Estate Guide
-- PostgreSQL Database Schema
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED'
);

CREATE TYPE project_status AS ENUM (
    'UPCOMING',
    'ONGOING',
    'COMPLETED',
    'SOLD_OUT',
    'UNKNOWN'
);

CREATE TYPE project_type AS ENUM (
    'APARTMENT',
    'VILLA',
    'PLOT',
    'BUILDER_FLOOR',
    'COMMERCIAL',
    'TOWNSHIP',
    'OTHER'
);

CREATE TYPE rating_category_code AS ENUM (
    'LOCATION_CONNECTIVITY',
    'AMENITIES_FACILITIES',
    'SURROUNDING_ENVIRONMENT',
    'CONSTRUCTION_QUALITY',
    'BUILDER'
);

CREATE TYPE comment_reaction_type AS ENUM (
    'LIKE',
    'DISLIKE'
);

CREATE TYPE knowledge_level AS ENUM (
    'BEGINNER',
    'INTERMEDIATE',
    'PROFESSIONAL'
);

CREATE TYPE content_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED'
);

CREATE TYPE consultation_status AS ENUM (
    'PENDING_PAYMENT',
    'PAID',
    'ASSIGNED',
    'ONGOING',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'REFUNDED'
);

CREATE TYPE message_type AS ENUM (
    'TEXT',
    'IMAGE',
    'DOCUMENT',
    'SYSTEM'
);

CREATE TYPE notification_type AS ENUM (
    'COMMENT_REPLY',
    'COMMENT_REACTION',
    'CONSULTATION_MESSAGE',
    'CONSULTATION_ASSIGNED',
    'CONSULTATION_STATUS',
    'SYSTEM'
);


-- ============================================================
-- USERS & AUTHORIZATION
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email VARCHAR(320) NOT NULL,
    password_hash TEXT NOT NULL,

    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),

    profile_image_url TEXT,

    is_verified BOOLEAN NOT NULL DEFAULT FALSE,

    status user_status NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_users_email_lower
ON users (LOWER(email))
WHERE deleted_at IS NULL;


CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(50) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE user_roles (
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, role_id),

    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE
);


-- ============================================================
-- BUILDERS
-- ============================================================

CREATE TABLE builders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,

    description TEXT,

    logo_url TEXT,
    website_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_builders_name
ON builders(name);


-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    builder_id UUID NOT NULL,

    name VARCHAR(250) NOT NULL,
    slug VARCHAR(280) NOT NULL,

    description TEXT,

    project_type project_type NOT NULL DEFAULT 'OTHER',
    status project_status NOT NULL DEFAULT 'UNKNOWN',

    location TEXT,
    locality VARCHAR(150),
    city VARCHAR(150),
    state VARCHAR(150),
    country VARCHAR(100) DEFAULT 'India',

    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    min_price NUMERIC(15, 2),
    max_price NUMERIC(15, 2),
    currency CHAR(3) NOT NULL DEFAULT 'INR',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_projects_builder
        FOREIGN KEY (builder_id)
        REFERENCES builders(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_project_price_range
        CHECK (
            min_price IS NULL
            OR max_price IS NULL
            OR min_price <= max_price
        ),

    CONSTRAINT chk_project_coordinates
        CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR
            (
                latitude BETWEEN -90 AND 90
                AND longitude BETWEEN -180 AND 180
            )
        )
);

CREATE UNIQUE INDEX uq_projects_builder_slug
ON projects(builder_id, slug)
WHERE deleted_at IS NULL;

CREATE INDEX idx_projects_builder
ON projects(builder_id);

CREATE INDEX idx_projects_city
ON projects(city);

CREATE INDEX idx_projects_locality
ON projects(locality);

CREATE INDEX idx_projects_status
ON projects(status);

CREATE INDEX idx_projects_type
ON projects(project_type);


-- ============================================================
-- PROJECT IMAGES
-- ============================================================

CREATE TABLE project_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,

    image_url TEXT NOT NULL,
    cloudinary_public_id TEXT NOT NULL,

    display_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_project_images_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_project_image_order
        CHECK (display_order >= 0)
);

CREATE INDEX idx_project_images_project
ON project_images(project_id, display_order);


-- ============================================================
-- PROJECT RATINGS
-- ============================================================

CREATE TABLE rating_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code rating_category_code NOT NULL UNIQUE,

    name VARCHAR(100) NOT NULL,
    description TEXT,

    display_order SMALLINT NOT NULL DEFAULT 0,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE project_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    rating_category_id UUID NOT NULL,

    score NUMERIC(2, 1) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_project_ratings_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_ratings_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_ratings_category
        FOREIGN KEY (rating_category_id)
        REFERENCES rating_categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_project_rating_score
        CHECK (score >= 0 AND score <= 5),

    CONSTRAINT uq_project_user_rating_category
        UNIQUE (
            project_id,
            user_id,
            rating_category_id
        )
);

CREATE INDEX idx_project_ratings_project
ON project_ratings(project_id);

CREATE INDEX idx_project_ratings_user
ON project_ratings(user_id);

CREATE INDEX idx_project_ratings_category
ON project_ratings(rating_category_id);


-- ============================================================
-- SAVED PROJECTS
-- ============================================================

CREATE TABLE saved_projects (
    user_id UUID NOT NULL,
    project_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, project_id),

    CONSTRAINT fk_saved_projects_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_saved_projects_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_saved_projects_project
ON saved_projects(project_id);

CREATE INDEX idx_saved_projects_user_created
ON saved_projects(user_id, created_at DESC);


-- ============================================================
-- COMMENTS
-- ============================================================

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL,
    user_id UUID NOT NULL,

    parent_comment_id UUID,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_comments_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_comment_id)
        REFERENCES comments(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_comment_content
        CHECK (LENGTH(TRIM(content)) > 0)
);

CREATE INDEX idx_comments_project
ON comments(project_id, created_at DESC);

CREATE INDEX idx_comments_parent
ON comments(parent_comment_id, created_at);

CREATE INDEX idx_comments_user
ON comments(user_id);


-- ============================================================
-- COMMENT REACTIONS
-- ============================================================

CREATE TABLE comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    comment_id UUID NOT NULL,
    user_id UUID NOT NULL,

    reaction_type comment_reaction_type NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_comment_reactions_comment
        FOREIGN KEY (comment_id)
        REFERENCES comments(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comment_reactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_comment_user_reaction
        UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_reactions_comment
ON comment_reactions(comment_id);

CREATE INDEX idx_comment_reactions_user
ON comment_reactions(user_id);


-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================

CREATE TABLE knowledge_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,

    description TEXT,

    display_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE knowledge_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category_id UUID NOT NULL,

    title VARCHAR(250) NOT NULL,
    slug VARCHAR(280) NOT NULL,

    level knowledge_level NOT NULL,

    definition TEXT NOT NULL,
    simple_explanation TEXT,

    status content_status NOT NULL DEFAULT 'DRAFT',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_knowledge_topics_category
        FOREIGN KEY (category_id)
        REFERENCES knowledge_categories(id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_knowledge_topics_category_slug
ON knowledge_topics(category_id, slug);

CREATE INDEX idx_knowledge_topics_category
ON knowledge_topics(category_id);

CREATE INDEX idx_knowledge_topics_level
ON knowledge_topics(level);

CREATE INDEX idx_knowledge_topics_status
ON knowledge_topics(status);


-- ============================================================
-- KNOWLEDGE TAGS
-- ============================================================

CREATE TABLE knowledge_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE knowledge_topic_tags (
    topic_id UUID NOT NULL,
    tag_id UUID NOT NULL,

    PRIMARY KEY (topic_id, tag_id),

    CONSTRAINT fk_knowledge_topic_tags_topic
        FOREIGN KEY (topic_id)
        REFERENCES knowledge_topics(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_knowledge_topic_tags_tag
        FOREIGN KEY (tag_id)
        REFERENCES knowledge_tags(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_topic_tags_tag
ON knowledge_topic_tags(tag_id);


-- ============================================================
-- BLOGS
-- ============================================================

CREATE TABLE blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    author_id UUID NOT NULL,

    title VARCHAR(300) NOT NULL,
    slug VARCHAR(330) NOT NULL UNIQUE,

    excerpt TEXT,
    body TEXT NOT NULL,

    cover_image_url TEXT,

    source_name VARCHAR(200),
    source_url TEXT,

    status content_status NOT NULL DEFAULT 'DRAFT',

    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_blogs_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_blogs_status_published
ON blogs(status, published_at DESC);

CREATE INDEX idx_blogs_author
ON blogs(author_id);


-- ============================================================
-- CONSULTATION SERVICES
-- ============================================================

CREATE TABLE consultation_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL UNIQUE,

    description TEXT,

    price NUMERIC(12, 2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',

    duration_days INTEGER NOT NULL DEFAULT 7,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_consultation_price
        CHECK (price >= 0),

    CONSTRAINT chk_consultation_duration
        CHECK (duration_days > 0)
);


-- ============================================================
-- CONSULTATIONS / BOOKINGS
-- ============================================================

CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,
    service_id UUID NOT NULL,

    sme_id UUID,

    status consultation_status NOT NULL DEFAULT 'PENDING_PAYMENT',

    amount NUMERIC(12, 2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',

    booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_consultations_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_consultations_service
        FOREIGN KEY (service_id)
        REFERENCES consultation_services(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_consultations_sme
        FOREIGN KEY (sme_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_consultation_amount
        CHECK (amount >= 0),

    CONSTRAINT chk_consultation_dates
        CHECK (
            expires_at IS NULL
            OR started_at IS NULL
            OR expires_at >= started_at
        )
);

CREATE INDEX idx_consultations_user
ON consultations(user_id, created_at DESC);

CREATE INDEX idx_consultations_sme
ON consultations(sme_id, status);

CREATE INDEX idx_consultations_status
ON consultations(status);

CREATE INDEX idx_consultations_expiry
ON consultations(expires_at)
WHERE status IN ('PAID', 'ASSIGNED', 'ONGOING');


-- ============================================================
-- CONSULTATION MESSAGES
-- ============================================================

CREATE TABLE consultation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    consultation_id UUID NOT NULL,
    sender_id UUID NOT NULL,

    message_type message_type NOT NULL DEFAULT 'TEXT',

    content TEXT,

    attachment_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    read_at TIMESTAMPTZ,

    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_consultation_messages_consultation
        FOREIGN KEY (consultation_id)
        REFERENCES consultations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_consultation_messages_sender
        FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_message_content
        CHECK (
            content IS NOT NULL
            OR attachment_url IS NOT NULL
        )
);

CREATE INDEX idx_consultation_messages_conversation
ON consultation_messages(
    consultation_id,
    created_at ASC
);

CREATE INDEX idx_consultation_messages_sender
ON consultation_messages(sender_id);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    type notification_type NOT NULL,

    title VARCHAR(250) NOT NULL,
    body TEXT,

    entity_type VARCHAR(100),
    entity_id UUID,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE INDEX idx_notifications_unread
ON notifications(user_id, created_at DESC)
WHERE is_read = FALSE;


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_builders_updated_at
BEFORE UPDATE ON builders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_project_ratings_updated_at
BEFORE UPDATE ON project_ratings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_knowledge_categories_updated_at
BEFORE UPDATE ON knowledge_categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_knowledge_topics_updated_at
BEFORE UPDATE ON knowledge_topics
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_blogs_updated_at
BEFORE UPDATE ON blogs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_consultation_services_updated_at
BEFORE UPDATE ON consultation_services
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_consultations_updated_at
BEFORE UPDATE ON consultations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- INITIAL ROLES
-- ============================================================

INSERT INTO roles (name)
VALUES
    ('USER'),
    ('ADMIN'),
    ('SME'),
    ('EDITOR'),
    ('MODERATOR')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- INITIAL RATING CATEGORIES
-- ============================================================

INSERT INTO rating_categories
    (code, name, description, display_order)
VALUES
    (
        'LOCATION_CONNECTIVITY',
        'Location & Connectivity',
        'Rating for location and connectivity of the project.',
        1
    ),
    (
        'AMENITIES_FACILITIES',
        'Amenities & Facilities',
        'Rating for amenities and facilities available in the project.',
        2
    ),
    (
        'SURROUNDING_ENVIRONMENT',
        'Surrounding & Environment',
        'Rating for surrounding environment and neighborhood.',
        3
    ),
    (
        'CONSTRUCTION_QUALITY',
        'Construction Quality',
        'Rating for construction quality.',
        4
    ),
    (
        'BUILDER',
        'Builder',
        'Rating for the builder/developer.',
        5
    )
ON CONFLICT (code) DO NOTHING;