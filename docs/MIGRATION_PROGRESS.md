# FastAPI / Next.js separation progress

Started and completed: 2026-10-24 (Africa/Addis_Ababa).

Status: implementation and local validation complete; production cutover not performed.

## Objective

Make FastAPI the sole backend while keeping the existing Next.js UI and API URL
contracts. Preserve assignment, pickup, review, teams, templates, schedules, messages,
monitoring, vault rendering, and read-only integrations.

## Decisions

- `frontend/`: Next.js pages/components, presentation helpers, API types and HTTP client.
- `backend/`: FastAPI routes, Python domain services, authentication, integrations,
  SQLite repository, runtime downloads, seed snapshot, and backend tests.
- Browser requests stay on `/api/*`; Next.js forwards them to FastAPI. Server-rendered
  pages call FastAPI with the incoming session cookie. No shared master API key is
  embedded in the frontend.
- SQLite uses a persistent file and `BEGIN IMMEDIATE` transactions for exclusive
  claims and schedule creation. JSON record shapes and IDs remain compatible with
  exported Blob data. This is a single-host persistence deployment; it needs durable
  storage and is not suitable for independent replicas with separate disks.
- Existing root `.env` and `.env.local` are left unchanged. Backend settings can load
  them during migration; new frontend configuration only needs `BACKEND_URL`.
- Existing Blob state is imported explicitly. Do not replace or silently reseed live
  state. The old Blob store remains untouched by the migration tools.

## Completed

- [x] Inventory the existing API, auth, persistence, integrations, and UI consumers.
- [x] Create separate frontend/backend project directories and root workspace commands.
- [x] Preserve original implementation temporarily outside the repo for port comparison.

## Migration checklist

- [x] Port Python domain services and transactional persistence.
- [x] Port all HTTP endpoints, session/scoped authentication, and setup downloads.
- [x] Move integration credential handling and vault fetching to FastAPI.
- [x] Wire Next.js server rendering, login gating, and browser proxy to FastAPI.
- [x] Add safe Blob export / SQLite import and reproducible local setup.
- [x] Verify backend behavior, frontend rendering/types/build, and the HTTP boundary.
- [x] Record final validation, deployment requirements, and remaining limitations.

## Implementation notes

- Ported workforce state transitions, assignment history, priority/capability pickup,
  dependency checks, subtasks, project membership, lead review/delegation, recurring
  schedules, logs, messaging, and credential rotation/revocation to Python.
- FastAPI now verifies expiring dashboard sessions and existing-format scrypt hashes.
  Existing v1 frontend session cookies require a fresh login after cutover.
- All protected endpoints authenticate at FastAPI, including direct backend requests;
  bypassing the Next.js UI does not bypass authorization.
- Next.js has one transport-only catch-all route for `/api/*`; it forwards cookies,
  bearer headers, form bodies, JSON, response status, redirects, and Set-Cookie.
  Runtime `BACKEND_URL` changes do not require rebuilding rewrite rules.
- Provider credentials, token refresh, Drive fetching, and snapshot fallback now
  belong to Python. The original provider descriptions and setup directions were
  retained as backend metadata. The frontend receives configured/not-configured flags.
- Backend dependencies were installed in an isolated temporary environment for
  validation. Browser/HTTP tests use temporary databases and test credentials.
- FastAPI TestClient's cross-thread startup hangs inside this environment's sandbox;
  the backend suite runs outside that sandbox against isolated fixtures.

## Final validation

| Check | Result |
| --- | --- |
| Python backend API/domain/auth/repository/integration/CLI suite | 18 tests passed |
| Frontend server-render test | Passed across six populated operational screens |
| TypeScript (`npm run typecheck`) | Passed |
| Production Next.js build (`npm run build`) | Passed with one transport-only API catch-all |
| Real two-process HTTP smoke | Passed |
| Docker Compose configuration | Validated with `--env-file /dev/null` |
| Migration export/import tooling | CLI round trip passed; IDs preserved; private export permissions; replacement refused unless explicit |
| Secret boundary scan | Frontend env access is limited to BACKEND_URL; provider/password/Blob implementation removed |
| Whitespace/diff check | Passed |

The real HTTP test started both services on temporary localhost ports and a temporary
SQLite database. It verified unauthenticated rejection, login redirects and HttpOnly
cookies through the proxy, logout, server rendering of overview/tasks/monitoring/
projects/messages/automation/docs/memory/integrations, task creation, direct backend
authentication, agent pickup, and 503 handling when FastAPI stopped. Processes were
shut down after the test. No live provider or production database writes were made.

The backend suite also checks concurrent exclusive claims, rollback, persisted state,
project isolation, dependency/hierarchy cycles, lead review and self-review rejection,
credential rotation/revocation and non-disclosure, message delivery/replies, recurring
catch-up/month-end EAT behavior, backup/import refusal, and read-only vault fallback.

## Cutover and limits

- The original root `.env`/`.env.local` were not moved or edited. Backend settings
  support them temporarily. Move real credentials to the backend deployment during
  cutover; never copy provider credentials into frontend environment files.
- Live Blob export/import was not run. Tools and step-by-step commands are in the
  README. Stop legacy writers, export once, import before seeding the new database,
  then start the new services. Original Blob objects remain available for rollback.
- Docker configuration was parsed; container images were not built/deployed here.
  Compose is invoked with an explicit empty CLI env file to avoid interpreting
  legacy root password hashes as variable references. Quote scrypt hashes in the
  backend env file.
- External provider calls were ported and fixture-tested, not tested against live
  accounts. Runtime credentials and scheduler/agent command configuration remain
  operator-supplied, as before.
- SQLite currently stores the compatible JSON aggregate and requires durable storage
  shared by backend workers on one host. PostgreSQL and relational normalization are
  intentionally outside this separation.
- The frontend was verified by server rendering and HTTP tests; no pixel-level
  browser visual review or public deployment is claimed.
