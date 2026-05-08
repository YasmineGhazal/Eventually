# Architecture — Eventually

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLIENT                                │
└──────────────────────────────┬──────────────────────────────────┘
                               │  HTTP/REST  Bearer <JWT>
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXPRESS API  :3001                            │
│                                                                 │
│  jwtMiddleware ──► tokenVersion check (DB hit per request)      │
│  requireRole   ──► role guard (user | admin)                    │
│                                                                 │
│  /auth            /job-postings      /applications   /jobs      │
│  register         CRUD (admin)       mine (user)     list       │
│  register-admin   apply (user)       status (admin)  status     │
│  login            applications                       download   │
│  me               skills-report                                 │
│  profile-image                                                  │
└──────┬────────────────────┬─────────────────────────────────────┘
       │                    │
       │ Mongoose           │ queue.add(jobType, { jobId, payload })
       ▼                    ▼
┌──────────────┐   ┌────────────────────────────────────────────┐
│   MongoDB    │   │           Redis  /  BullMQ                 │
│              │   │           "jobs" queue                     │
│  users       │   │   attempts: 3  backoff: exponential 1s     │
│  jobpostings │   └───────────────────┬────────────────────────┘
│  applications│                       │ dequeue
│  jobs        │                       ▼
│              │   ┌────────────────────────────────────────────┐
│              │   │   BullMQ Worker  (concurrency: N)          │
│              │   │                                            │
│              │   │  image-resize          report-generate     │
│              │   │  ─────────────         ─────────────────── │
│              │   │  axios.get(imageUrl)   fetch posting       │
│              │   │  sharp.resize()        fetch applications  │
│              │   │  toBuffer({            compute match scores│
│              │   │    resolveWithObject}) fast-csv → CSV      │
│              │   │  write profileImageUrl                     │
│              │◄──┤                                            │
│  jobs.status │   │  on complete → JobModel.findByIdAndUpdate  │
│  jobs.result │   │  on failed   → status=failed, error=msg    │
└──────────────┘   └────────────────────────────────────────────┘
```

### Request → job lifecycle

```
POST /auth/profile-image          POST /job-postings/:id/skills-report
         │                                      │
         ▼                                      ▼
  JobModel.create(pending)             JobModel.create(pending)
  queue.add('image-resize', …)         queue.add('report-generate', …)
  → 202 { jobId }                      → 202 { jobId }
         │                                      │
         ▼  (async)                             ▼  (async)
  Worker picks up job                  Worker picks up job
  status → active                      status → active
  process…                             process…
  status → completed | failed          status → completed | failed
         │                                      │
         ▼                                      ▼
  GET /jobs/:id   (poll until done)    GET /jobs/:id/download  (CSV)
```

---

## Why BullMQ

BullMQ gives us durable, retryable queues on top of Redis. A DB-backed queue (polling MongoDB) means every worker constantly queries for new work, and the polling interval creates artificial latency. Bare Redis pub/sub is fire-and-forget — if a worker crashes mid-job, the message is gone. BullMQ gives us durable delivery, built-in retry/backoff, and a concurrency model that needs no distributed locking logic.

## Why MongoDB alongside Redis

Redis and MongoDB own different things at different time horizons.

- **Redis / BullMQ** owns the queue lifecycle: enqueued, active, delayed, failed. This state is ephemeral and optimised for throughput.
- **MongoDB** owns the business record: what was requested, what came back, the error string, attempt count. This record lives indefinitely and is what the API surfaces to callers.

If we dropped MongoDB and relied on BullMQ's job data alone, completed job results would disappear when BullMQ's retention window expires. If we dropped Redis and polled MongoDB, we'd lose the clean separation between scheduling work and recording results.

## Why JWT

JWTs are stateless — no session store needed to verify a token. For a background-job API where every call is authenticated but there's no requirement for session invalidation, this is the right tradeoff: simple, horizontally scalable, no extra infrastructure dependency.

Token revocation is still possible via a `tokenVersion` counter stored on the user document. Every login or registration increments it and embeds it in the JWT as `tv`. Every request checks `tv` against the DB — so a compromised token is invalidated the next time the user logs in, without any token blocklist.

## Why Express over NestJS

NestJS pays off when a team is large, the API has many modules, or the convention layer saves onboarding time. For a three-route API with two worker types, the NestJS module/DI/decorator system is overhead with no return. Express + plain TypeScript classes is easier to read, debug, and extend without learning a framework's lifecycle.

## Concurrency and Retry

Concurrency is set by `WORKER_CONCURRENCY` (default: 3), read from `config.ts` at startup. A single BullMQ `Worker` dispatches to `processImageResize` or `processReportGenerate` by job name — one consumer per queue avoids the race condition that two competing workers would cause. Each job is enqueued with `{ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }`. The `failed` worker event handles final-failure writes to MongoDB; individual processors rethrow errors so BullMQ can schedule retries.

## Manual Dependency Injection

There is no DI container. `createApp(queue?)` accepts an optional queue instance; if omitted it creates a real BullMQ queue. This single seam lets the E2E test suite inject a `fakeQueue` that writes directly to MongoDB after a short timeout — no Redis required for testing. Services receive their dependencies as constructor arguments and are wired together in `createApp`.

## Intentionally Left Out

- **Rate limiting** — no per-user quotas defined; adding it before requirements exist would force a premature storage decision (Redis vs in-memory).
- **WebSockets / SSE** — polling is sufficient; push would add a stateful connection layer.
- **Refresh tokens** — 7-day JWT expiry is good enough for a job API; refresh tokens reintroduce the session-store problem JWT was chosen to avoid.

## AI Usage

Claude (Sonnet 4.6) was used to scaffold the full project across both the initial NestJS version and the Express rewrite.

**Where suggestions were overridden:**

The original NestJS scaffolding used two `@Processor(JOBS_QUEUE)` classes — one for each job type — each creating its own BullMQ `Worker`. Both workers consumed from the same queue, with an early-return guard (`if (job.name !== JobType.X) return`) to skip irrelevant jobs. This is subtly broken: whichever worker picks up a job first marks it complete, so the intended processor may never run. The rewrite replaced this with a single `Worker` that dispatches by job name — the correct BullMQ pattern.

The image-resize worker hardcoded `image/jpeg` as the MIME type in the data URI regardless of the input image format. The fix was switching from `toBuffer()` to `toBuffer({ resolveWithObject: true })`, which returns `info.format` from sharp's own output metadata. The hardcoded version would have silently corrupted PNG and WebP images by labelling them as JPEG.

**One specific decision:** AI defaulted to keeping `class-validator` DTOs for the Express rewrite (familiar from the NestJS version). This was replaced with `zod` schemas defined inline in each router file. Zod needs no decorators or `reflect-metadata`, the schemas are co-located with the routes that use them, and parse errors produce structured output with no extra middleware layer.
