CREATE TYPE "project_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "project_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "project_id" UUID,
    "builder_name" VARCHAR(200) NOT NULL,
    "name" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "project_type" "project_type" NOT NULL DEFAULT 'OTHER',
    "status" "project_status" NOT NULL DEFAULT 'UNKNOWN',
    "location" TEXT,
    "locality" VARCHAR(150),
    "city" VARCHAR(150),
    "state" VARCHAR(150),
    "country" VARCHAR(100) DEFAULT 'India',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "min_price" DECIMAL(15,2),
    "max_price" DECIMAL(15,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "image_url" TEXT NOT NULL,
    "image_public_id" TEXT NOT NULL,
    "request_status" "project_request_status" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_project_requests_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_project_requests_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "fk_project_requests_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX "idx_project_requests_status_created" ON "project_requests"("request_status", "created_at");
CREATE INDEX "idx_project_requests_requester_created" ON "project_requests"("requester_id", "created_at" DESC);
