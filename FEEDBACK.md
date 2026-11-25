# Feedback API

**Phase: 8 — Feedback**

Users rate "How likely would you recommend us to people in the real estate market?" on a
**1–10** scale, with an optional written message. Admins read all responses with a summary
(average, NPS, score distribution).

- Database: `database_scripts/schema_script_7.sql` (table `feedback`)
- Module: `src/feedback/`
- All routes are under the global `/api` prefix and need `Authorization: Bearer <access token>`.

| # | Method | Path | Who |
|---|--------|------|-----|
| 1 | POST | `/api/feedback` | Any signed-in user |
| 2 | GET | `/api/feedback/me` | Any signed-in user |
| 3 | GET | `/api/admin/feedback` | ADMIN only |

---

## 1. Submit Feedback

Saves one feedback response for the signed-in user. A user can send feedback more than once
(each submission is a new row), but only once per minute.

```bash
curl --location 'http://localhost:3001/api/feedback' \
--header 'Authorization: Bearer ' \
--header 'Content-Type: application/json' \
--data '{
    "rating": 9,
    "message": "Very helpful for comparing projects. Would love more builder details."
}'
```

**Body**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `rating` | integer (JSON number) | Yes | Whole number, 1–10 |
| `message` | string \| null | No | Trimmed; max 2000 characters. Empty / whitespace-only → saved as `null` |

Example Response: `201 Created`

```json
{
    "message": "Thank you for your feedback",
    "data": {
        "id": "5b0e8c47-1f6a-4c3e-9a51-2d7c3b9e0f12",
        "rating": 9,
        "message": "Very helpful for comparing projects. Would love more builder details.",
        "created_at": "2026-11-25T10:15:42.118Z"
    }
}
```

Error Responses:

`400 Bad Request` — invalid rating / message

```json
{
    "message": ["rating must be between 1 and 10"],
    "error": "Bad Request",
    "statusCode": 400
}
```

Other validation messages: `rating must be a whole number between 1 and 10`,
`message must be at most 2000 characters`, `message must be a string`,
`property <name> should not exist` (unknown fields are rejected).

`401 Unauthorized` — missing / expired access token.

`429 Too Many Requests` — the same user submitted less than a minute ago

```json
{
    "statusCode": 429,
    "message": "You just sent feedback. Please wait a minute before sending more."
}
```

---

## 2. Get My Latest Feedback

Returns the signed-in user's most recent feedback (or `null` if they have never sent any) and
how many times they have sent feedback. The web app uses it to show "You last rated us 8/10".

```bash
curl --location 'http://localhost:3001/api/feedback/me' \
--header 'Authorization: Bearer '
```

Example Response: `200 OK`

```json
{
    "message": "Feedback fetched successfully",
    "data": {
        "id": "5b0e8c47-1f6a-4c3e-9a51-2d7c3b9e0f12",
        "rating": 9,
        "message": "Very helpful for comparing projects. Would love more builder details.",
        "created_at": "2026-11-25T10:15:42.118Z"
    },
    "totalSubmitted": 2
}
```

No feedback yet:

```json
{
    "message": "Feedback fetched successfully",
    "data": null,
    "totalSubmitted": 0
}
```

---

## 3. List All Feedback (Admin)

Paginated list of every response with the user who sent it, plus a summary. Only ADMIN can
access this api.

```bash
curl --location 'http://localhost:3001/api/admin/feedback?page=1&limit=20&sortBy=newest&minRating=1&maxRating=6&hasMessage=true' \
--header 'Authorization: Bearer '
```

**Query params** (all optional)

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer ≥ 1 | 1 | Page number |
| `limit` | integer 1–100 | 20 | Page size |
| `sortBy` | `newest` \| `oldest` | `newest` | Order by submission time |
| `minRating` | integer 1–10 | — | Only ratings ≥ this |
| `maxRating` | integer 1–10 | — | Only ratings ≤ this (must be ≥ `minRating`) |
| `hasMessage` | `true` \| `false` | — | `true` = only with a message, `false` = rating only |

Useful filters: promoters `minRating=9`, passives `minRating=7&maxRating=8`, detractors `maxRating=6`.

Example Response: `200 OK`

```json
{
    "message": "Feedback fetched successfully",
    "data": [
        {
            "id": "a1d4f0b2-7c3e-4e2a-8b19-6f0c2d9e1a77",
            "rating": 4,
            "message": "Search results were slow and some project prices were outdated.",
            "created_at": "2026-11-24T18:02:11.540Z",
            "user": {
                "id": "b171cb0f-670f-4814-abc6-2cf1ced24427",
                "name": "ILZ",
                "email": "il9zdci98e@ooynib.com",
                "profile_image_url": null
            }
        }
    ],
    "summary": {
        "totalResponses": 42,
        "averageRating": 7.6,
        "npsScore": 19,
        "promoters": 18,
        "passives": 14,
        "detractors": 10,
        "distribution": {
            "1": 1, "2": 0, "3": 2, "4": 3, "5": 1,
            "6": 3, "7": 6, "8": 8, "9": 9, "10": 9
        }
    },
    "pagination": {
        "page": 1,
        "limit": 20,
        "totalItems": 7,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPreviousPage": false
    }
}
```

Notes:

- `summary` always covers **all** feedback (it ignores the filters); `data` and `pagination`
  follow the filters.
- NPS buckets on the 1–10 scale: promoters 9–10, passives 7–8, detractors 1–6.
  `npsScore = round((promoters − detractors) / totalResponses × 100)`, from −100 to 100.
  `averageRating` and `npsScore` are `null` when there is no feedback.
- `user` holds the sender; feedback is deleted with the user (ON DELETE CASCADE).

Error Responses: `400` (bad query, e.g. `minRating cannot be greater than maxRating`),
`401` (not signed in), `403` (signed in but not ADMIN).

---

## Database

`database_scripts/schema_script_7.sql` (idempotent — safe to re-run):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `users.id`, ON DELETE CASCADE |
| `rating` | smallint NOT NULL | CHECK 1–10 |
| `message` | text NULL | CHECK NULL or 1–2000 chars, not blank |
| `created_at` | timestamptz NOT NULL | default `now()` |

Indexes: `(user_id, created_at DESC)`, `(created_at DESC)`, `(rating)`.

Apply it, then regenerate the Prisma client:

```bash
psql "$DATABASE_URL" -f database_scripts/schema_script_7.sql
npx prisma generate   # also runs as part of `npm run build`
```
