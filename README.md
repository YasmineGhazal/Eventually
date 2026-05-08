# Eventually

A job board API with integrated async processing, built with Express, TypeScript, BullMQ, Redis, and MongoDB.

Admins post job openings with required skills. Users apply with a cover letter and their skills. When an admin requests a skills report for a posting, a background worker computes per-applicant match scores and produces a CSV. Users can also upload a profile image — a background worker resizes it and writes it back to their account.

---

## Tech stack

| Layer      | Choice                                 |
|------------|----------------------------------------|
| Runtime    | Node 20, TypeScript                    |
| HTTP       | Express                                |
| Queue      | BullMQ (Redis-backed)                  |
| Database   | MongoDB via Mongoose                   |
| Auth       | JWT + token-version revocation         |
| Validation | Zod                                    |
| Testing    | Jest (unit) + Supertest (E2E)          |

---

## Quick start

```bash
cp .env.example .env
# Set JWT_SECRET and ADMIN_SECRET in .env
docker-compose up --build
```

The API starts at `http://localhost:3001`.

Docker waits for MongoDB to pass its health check, seeds the database, then starts the server. The seed is idempotent — safe to re-run.

**Seeded credentials:**

| Role  | Email                  | Password     |
|-------|------------------------|--------------|
| Admin | `admin@eventually.com` | `Admin1234!` |
| User  | `user@eventually.com`  | `User1234!`  |

---

## Run locally

Requires Node 20+, a running Redis instance, and a running MongoDB instance.

```bash
npm install
cp .env.example .env
# Edit .env — set REDIS_HOST, MONGO_URI, JWT_SECRET, ADMIN_SECRET
npm run start:dev
```

---

## Test

```bash
npm install
npm test           # unit tests — no running services needed
npm run test:e2e   # end-to-end tests — requires MongoDB
```

Unit tests live in `test/unit/` and mock all I/O. The E2E suite in `test/app.e2e-spec.ts` connects to a real MongoDB instance and injects a fake queue, so Redis is not required.

---

## Authentication

All endpoints except `/auth/register`, `/auth/register-admin`, and `/auth/login` require `Authorization: Bearer <token>`.

Every login or registration issues a new token **and immediately invalidates all previous tokens** for that user. This is enforced by a `tokenVersion` counter on the user document — incremented on every auth call, embedded in the JWT as `tv`, and checked against the database on every request. A token with a stale `tv` is rejected with `401`.

### Roles

| Role    | How to obtain                                         |
|---------|-------------------------------------------------------|
| `user`  | `POST /auth/register` — open to anyone                |
| `admin` | `POST /auth/register-admin` — requires `ADMIN_SECRET` |

`ADMIN_SECRET` is only required at registration time. After that, admins log in through the normal login endpoint.

```bash
# Register an admin
curl -X POST http://localhost:3001/auth/register-admin \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@example.com", "password": "yourpassword", "adminSecret": "<ADMIN_SECRET>" }'

# Log in (works for both roles)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@example.com", "password": "yourpassword" }'
```

Use the returned `access_token` as `Authorization: Bearer <token>` on all subsequent requests.

---

## API

### Auth

```
POST /auth/register        { "email", "password" }                        → { "access_token" }
POST /auth/register-admin  { "email", "password", "adminSecret" }         → { "access_token" }
POST /auth/login           { "email", "password" }                        → { "access_token" }
POST /auth/profile-image   { "imageUrl" }                                 → { "jobId" }        [authenticated]
```

`POST /auth/profile-image` enqueues a background resize job (200×200 px). Poll `GET /jobs/:jobId` for status. When completed, `user.profileImageUrl` is updated with the resized image as a base64 data URI.

---

### Job board

#### Job postings

```
POST   /job-postings                                                        [admin]
  body: { "title", "description", "company", "location", "type", "requiredSkills"? }
  → posting

GET    /job-postings                                                        [any]
  query: ?status=&type=&page=&limit=
  → { data, total, page, limit }

GET    /job-postings/:id                                                    [any]
  → posting

PATCH  /job-postings/:id                                                    [admin]
  body: { "title"?, "description"?, "company"?, "location"?, "type"?, "status"?, "requiredSkills"? }
  → updated posting

DELETE /job-postings/:id                                                    [admin]
  → 204

POST   /job-postings/:id/skills-report                                      [admin]
  → { "jobId" }
```

`type`: `full-time` | `part-time` | `contract` | `remote`  
`status`: `open` | `closed`  
`requiredSkills`: array of skill strings, e.g. `["TypeScript", "React", "Node.js"]`

`POST /job-postings/:id/skills-report` enqueues a background report job and returns a `jobId`. Poll `GET /jobs/:jobId` until `status` is `completed`, then download the file with `GET /jobs/:jobId/download`. The CSV contains one row per applicant with their applied skills, matched skills, missing skills, and a percentage match score against the posting's `requiredSkills`.

#### Applications

```
POST  /job-postings/:id/apply                                               [user]
  body: { "coverLetter", "resumeUrl"?, "skills"? }
  → application

GET   /job-postings/:id/applications                                        [admin]
  → application[]

GET   /applications/mine                                                    [user]
  → application[]

PATCH /applications/:id/status                                              [admin]
  body: { "status" }
  → application
```

`status`: `pending` | `reviewed` | `accepted` | `rejected`  
`skills`: array of skill strings the applicant brings, e.g. `["TypeScript", "React", "MongoDB"]`

- Applying twice to the same posting returns `409`.
- Admins cannot apply to postings (`403`).
- Users cannot view all applicants for a posting (`403`).

---

### Background jobs

Background jobs are triggered by dedicated endpoints (`POST /auth/profile-image`, `POST /job-postings/:id/skills-report`) and tracked via the jobs API.

```
GET  /jobs/:id                                                              [any]
  → job record

GET  /jobs/:id/download                                                     [any]
  → CSV file download (only valid for completed report-generate jobs)

GET  /jobs                                                                  [any]
  query: ?status=&type=&page=&limit=
  → { data, total, page, limit }
```

Status lifecycle: `pending` → `active` → `completed` | `failed`  
Failed jobs are retried up to 3 times with exponential backoff (1 s, 2 s, 4 s).

#### image-resize

Triggered by `POST /auth/profile-image`. Downloads the image at `imageUrl`, resizes it to 200×200 px using a center cover crop (preserves aspect ratio, no distortion), and writes the result to `user.profileImageUrl` as a base64 data URI. The original image format (JPEG, PNG, WebP, etc.) is preserved in the output.

```json
// result on completion
{ "userId": "...", "width": 200, "height": 200 }
```

#### report-generate

Triggered by `POST /job-postings/:id/skills-report`. Fetches the posting's `requiredSkills` and all applications for that posting. For each applicant, computes matched skills, missing skills, and a percentage match score.

```json
// result on completion
{
  "jobPostingId": "...",
  "csv": "applicantEmail,appliedSkills,matchedSkills,missingSkills,matchScore\n...",
  "rowCount": 3
}
```

Example CSV row:
```
user@example.com,"TypeScript, React, MongoDB","TypeScript, React","PostgreSQL, Docker",40%
```

---

## Data model

Four MongoDB collections. `jobs` is independent; the other three are related.

### `users`

| Field             | Type   | Notes                                                                                       |
|-------------------|--------|---------------------------------------------------------------------------------------------|
| `email`           | String | unique, lowercased                                                                          |
| `passwordHash`    | String | bcrypt, 10 rounds                                                                           |
| `role`            | String | `user` \| `admin`                                                                           |
| `tokenVersion`    | Number | incremented on every login; embedded in the JWT as `tv` — a mismatch invalidates the token |
| `profileImageUrl` | String | optional — written by the image-resize worker as a base64 data URI                         |

### `jobpostings`

| Field           | Type     | Notes                                                      |
|-----------------|----------|------------------------------------------------------------|
| `title`         | String   |                                                            |
| `description`   | String   |                                                            |
| `company`       | String   |                                                            |
| `location`      | String   |                                                            |
| `type`          | String   | `full-time` \| `part-time` \| `contract` \| `remote`       |
| `status`        | String   | `open` \| `closed` — indexed                               |
| `requiredSkills` | String[] | skills the role requires — used to score applicants        |
| `postedBy`      | ObjectId | references `users` — the admin who created the posting     |

### `applications`

| Field          | Type     | Notes                                                       |
|----------------|----------|-------------------------------------------------------------|
| `jobPostingId` | ObjectId | references `jobpostings`                                    |
| `userId`       | ObjectId | references `users`                                          |
| `coverLetter`  | String   |                                                             |
| `resumeUrl`    | String   | optional                                                    |
| `skills`       | String[] | skills the applicant brings — compared against `requiredSkills` in the report |
| `status`       | String   | `pending` \| `reviewed` \| `accepted` \| `rejected`        |

Compound unique index on `{ jobPostingId, userId }` enforces one application per user per posting.

### `jobs`

| Field      | Type   | Notes                                                         |
|------------|--------|---------------------------------------------------------------|
| `type`     | String | `image-resize` \| `report-generate`                          |
| `status`   | String | `pending` \| `active` \| `completed` \| `failed` — indexed   |
| `payload`  | Mixed  | input provided at submission time                             |
| `result`   | Mixed  | output written by the worker on completion                    |
| `error`    | String | last error message, set on failure                            |
| `attempts` | Number | number of attempts made                                       |

### Relationships

```
users ──(1:many)──> jobpostings       via postedBy
users ──(1:many)──> applications      via userId
jobpostings ──(1:many)──> applications      via jobPostingId
```

---

## Architecture

```
src/
├── auth/
│   ├── auth.middleware.ts    verifies JWT signature and checks tokenVersion against the DB
│   ├── auth.router.ts        /auth/register, /register-admin, /login, /me, /profile-image
│   ├── auth.service.ts       register, login, freshToken — each call increments tokenVersion
│   ├── role.middleware.ts    requireRole(...roles) factory for protecting routes
│   └── user.model.ts         Mongoose User schema
├── job-postings/
│   ├── job-posting.model.ts
│   ├── job-postings.router.ts   includes /apply and /skills-report sub-routes
│   └── job-postings.service.ts
├── applications/
│   ├── application.model.ts
│   ├── applications.router.ts
│   └── applications.service.ts
├── jobs/
│   ├── job.model.ts
│   ├── jobs.router.ts
│   └── jobs.service.ts       saves job to MongoDB then enqueues it in BullMQ
├── workers/
│   ├── image-resize.worker.ts     downloads, resizes (cover crop), writes profileImageUrl to user
│   ├── report-generate.worker.ts  fetches posting + applications, produces skills-match CSV
│   └── start-workers.ts           single BullMQ Worker, dispatches by job.name
├── scripts/
│   └── seed.ts               idempotent seed script, runs automatically in Docker
├── common/
│   ├── config.ts             all environment variables in one place
│   └── constants.ts          all enums shared across modules
├── app.ts                    createApp(queue?) — assembles Express with all routers
└── main.ts                   connects to MongoDB, starts the server and worker process
test/
├── unit/                     isolated unit tests, no running services needed
│   ├── image-resize.worker.spec.ts
│   ├── report-generate.worker.spec.ts
│   └── jobs.service.spec.ts
└── app.e2e-spec.ts           full API flow tests against a real MongoDB instance
```

### How it works

**Manual dependency injection.** There is no DI container. Services receive their dependencies as constructor arguments, and `createApp(queue?)` accepts an optional queue instance. This lets the test suite pass in a fake queue without needing a live Redis connection.

**Single BullMQ Worker.** A single `Worker` instance in `start-workers.ts` handles all job types and dispatches by `job.name`. Using one worker avoids a race condition that arises when multiple workers compete for the same job.

**Token revocation.** Issuing a new token (on any login or registration) increments `tokenVersion` in the database. Every request validates the `tv` claim in the JWT against the current database value, so older tokens are rejected immediately without waiting for expiry.

**Startup seed.** The Docker Compose command is `node dist/scripts/seed.js && node dist/main`. The seed runs only after MongoDB passes its health check, and it is safe to re-run because it deletes its own records by email before inserting.

**Validation.** Request bodies are validated with Zod at the router layer. Zod works as plain functions with no framework coupling, which keeps the validation logic portable and testable in isolation.

---

## Environment variables

| Variable             | Default                              | Description                                          |
|----------------------|--------------------------------------|------------------------------------------------------|
| `MONGO_URI`          | `mongodb://mongo:27017/eventually`   | MongoDB connection string                            |
| `REDIS_HOST`         | `redis`                              | Redis hostname                                       |
| `REDIS_PORT`         | `6379`                               | Redis port                                           |
| `JWT_SECRET`         | —                                    | Secret used to sign JWTs — must be set in production |
| `ADMIN_SECRET`       | —                                    | Required to register an admin account                |
| `WORKER_CONCURRENCY` | `3`                                  | Number of jobs processed concurrently per worker     |
| `PORT`               | `3001`                               | HTTP port                                            |
