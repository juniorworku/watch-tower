# FastAPI / Next.js separation progress

Started and completed: 2026-10-24 (Africa/Addis_Ababa).

Latest deployment: the Docker/PostgreSQL section below supersedes the original
SQLite-only deployment limits recorded during the service separation.

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
- At the initial separation, Docker configuration was parsed; images had not yet been built/deployed.
  Compose is invoked with an explicit empty CLI env file to avoid interpreting
  legacy root password hashes as variable references. Quote scrypt hashes in the
  backend env file.
- External provider calls were ported and fixture-tested, not tested against live
  accounts. Runtime credentials and scheduler/agent command configuration remain
  operator-supplied, as before.
- At the initial separation, SQLite stored the compatible JSON aggregate and required durable storage
  shared by backend workers on one host. PostgreSQL and relational normalization are
  intentionally outside this separation.
- The frontend was verified by server rendering and HTTP tests; no pixel-level
  browser visual review or public deployment is claimed.

## Local sign-in repair — 2026-10-24

- Corrected the backend configuration root so backend `.env` and `.env.local`
  load after the legacy root files, as documented.
- Replaced the conflicting local password hash through an ignored, private
  `backend/.env.local`; original root environment files remain unchanged.
  A configured hash intentionally takes precedence over a plaintext password.
- Preserved existing root `data/watchtower.sqlite3` installations when the new
  backend database does not exist. Explicit database configuration still wins.
- Added regression coverage for configuration paths, environment precedence,
  and database continuity. All 20 backend tests passed.
- Verified login and authenticated sessions against the running FastAPI on port
  8000 and the current frontend on port 3001. An older root-directory Next.js
  process occupies port 3000 and returns 404 for the sign-in routes; use port
  3001 for the current session, or stop the old server before restarting the
  current frontend on port 3000.

## Docker and PostgreSQL deployment — 2026-10-24

- Added PostgreSQL 17 as a third Compose service with a persistent named volume
  and no published database port. Backend and frontend start after dependency
  health checks pass. The API health check verifies database access.
- Added a Psycopg PostgreSQL adapter selected by `DATABASE_URL`. JSONB preserves
  the existing state model; row locks serialize mutations and transaction rollback
  prevents partial updates. An advisory lock protects concurrent initialization.
  Entity-per-table normalization remains separate work.
- Kept SQLite support for development, exports, and rollback. Exported the existing
  local database to private `exports/docker-migration.json`, then imported into an
  empty PostgreSQL database without modifying the original SQLite records.
- Migrated 5 tasks, 3 projects, 3 agents, and 1 log. Compared the complete imported
  state, including IDs and credential hashes, to the source snapshot (excluding
  the import timestamp).
- Added `tools/prepare-docker.py` for private Docker environment setup. Generated
  ignored backend `.env.docker` / `.env.postgres` with a random database password;
  existing root and backend local configuration remains unchanged. Secrets and
  SQLite files are excluded from image build contexts.
- Built the production Next.js and FastAPI images and started the stack locally:
  frontend `http://localhost:3002`, API `http://127.0.0.1:8001`, internal PostgreSQL
  `db:5432`. Existing development servers were left in place.
- PostgreSQL contract tests passed against disposable test databases: concurrent
  initialization, exclusive claims, rollback, persistence, import protection,
  authentication, task creation, and readiness.
- Verified the configured sign-in password through Docker, authenticated cookies,
  unauthorized API rejection, and seven dashboard routes. Docker usage, migration,
  backup, port configuration, and persistent-volume behavior are in the README.
- Final verification: 21 backend regression tests passed, plus both real PostgreSQL
  contract tests. Recreated all three containers while retaining the named volume;
  the complete imported state matched the snapshot afterwards and sign-in still
  worked. All three services report healthy.


## Simplified Docker commands — 2026-10-24

- Normal startup now uses `docker compose up`; rebuild/background startup uses
  `docker compose up -d --build`. Removed the extra env-file argument from current
  operational documentation and clarified that setup/migration run only once.
- Single-quoted the existing dollar-containing root `.env` hash so Compose does
  not interpolate it. Verified every parsed raw env value stayed identical.
  This changes quoting only; Docker credentials and PostgreSQL data are unchanged.
- Plain `docker compose config --quiet` passes with no warnings.


## Vercel deployment script — 2026-10-24

- Added `npm run deploy:vercel`, an isolated source-staging deployment script,
  `vercel.json`, two Vercel Dockerfiles, and `.vercelignore`. Both HTTP containers
  deploy as one Vercel Services project with a frontend-to-backend URL binding.
- PostgreSQL remains a managed backing service; the local Compose database/volume
  is not uploaded. Production configuration must be supplied in the Vercel project.
  No local records are automatically imported or replaced.
- Added a local `--check` mode and tests for source exclusions, required production
  settings, local-only database rejection, and non-exportable Secret placeholders.
  The upload excludes local dotenv files, databases, and exports, and the pulled
  Production configuration is deleted before deployment.
- Vercel configuration matches the published schema constraints. Local script
  checks and tests passed. Dockerfile build/runtime checks are recorded below.
- Live Vercel deployment has not been run: no Vercel account or managed PostgreSQL
  production configuration was supplied for this task. Services and Container
  Runtime are beta features; README documents prerequisites and limits.
- Both Vercel Dockerfiles built successfully. Temporary containers verified the
  default port 80, backend readiness, internal HTTP routing, middleware redirects,
  unauthorized API rejection, login/session forwarding, and dashboard/task rendering.
  Temporary containers were removed afterwards; the existing Compose app remains
  running. Vercel-specific binding injection and cloud routing still need live
  verification after account/database setup.
