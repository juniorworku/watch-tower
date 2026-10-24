# FastAPI / Next.js separation progress

Started and completed: 2026-10-24 (Africa/Addis_Ababa).

Latest deployment: Vercel production is live at https://watchtower-lyart.vercel.app.
The final cloud verification below supersedes the original local-only deployment limits.

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


## Vercel account setup follow-up — 2026-10-24

- The user's CLI created and linked the Vercel project successfully. A read-only
  preflight confirmed the next blocker is missing Production database configuration;
  no live application deployment was attempted in this follow-up.
- Disabled optional CLI plugin prompts during scripted commands and added
  `npm run deploy:vercel -- --preflight` to check cloud settings without publishing.
- Missing required Production variables are now reported together, with guidance
  that local dotenv files do not configure cloud deployment. Regression checks pass.


## Vercel build-context repair — 2026-10-24

- Cloud logs showed Vercel building the frontend from `frontend/`, while the initial
  Dockerfiles expected repository-root files. Earlier local root-context builds
  missed this mismatch.
- Set explicit frontend/backend service roots and service-relative Dockerfile
  entrypoints. Both Vercel Dockerfiles now copy only their service-local files.
- Added a standalone frontend lockfile based on the workspace's pinned dependency
  records and per-service Docker ignore rules to exclude credentials and databases.
- Added regression checks that every Docker COPY input exists inside the staged
  service context and that the frontend lockfile matches its manifest. Script
  tests and upload checks passed. Rebuild using `npm run deploy:vercel` to send
  the repaired source; retrying the old deployment keeps its old files.
- Both images successfully rebuilt using their service directories as contexts.
  The standalone frontend passed local startup, favicon, middleware redirect,
  login/session, and authenticated task-page checks in a temporary container.


## Guided production configuration — 2026-10-24

- Missing Production settings now explicitly report that nothing was uploaded.
- Added `npm run deploy:vercel -- --setup`: Vercel's interactive env commands prompt
  for missing variables in the linked project, store database/password values as
  Secrets, preserve existing settings, and continue to deployment after validation.
- Hosted PostgreSQL remains required. The helper does not provision a database,
  upload Docker credentials, or automatically replace cloud records. Local tests
  and upload checks pass; guided cloud writes are left for the user's terminal.


## Hosted PostgreSQL provisioned — 2026-10-24

- At the user's request, checked the Vercel team's existing Neon resources, then
  created `watchtower-db` on the explicitly free `free_v3` plan in `iad1`.
  Neon Auth and Realtime were disabled because the app uses its own authentication.
- Connected the database to the `watchtower` project's Production environment.
  Vercel injected `DATABASE_URL`; a subsequent preflight confirms it is present.
- No local data was imported and no production records were replaced. The remaining
  deployment inputs are the dashboard password/hash and public HTTPS application
  URL. The guided `--setup` command can collect those in the user's terminal.
- Read the project's verified production domain and set `PUBLIC_APP_URL` to
  `https://watchtower-lyart.vercel.app` as Production Config without overwriting
  an existing value. Only the production dashboard sign-in credential remains
  for the user to enter through `npm run deploy:vercel -- --setup`.


## Deployment source-filter repair — 2026-10-24

- Retrieved the failed cloud build log and identified missing `frontend/lib/data`
  modules. Both the upload staging filter and the unanchored Vercel ignore rule
  treated application source named `data` as a database directory.
- Limited staging exclusions to repository `data` and `backend/data`; anchored the
  corresponding Vercel ignore rules. Credentials and database files remain excluded.
- Regression coverage checks all five frontend data modules survive staging and
  verifies Vercel ignore behavior with gitignore semantics. Local tests pass.
- Verification now builds the actual staged upload, rather than the repository
  source tree, to exercise the same file set sent to Vercel.

- Cloud deployment of the repaired upload completed, resolving compilation errors.
  Live checks then exposed Neon's rejection of startup `options` containing
  `lock_timeout`. Moved lock/statement timeout configuration to `SET LOCAL` inside
  each transaction, compatible with Neon's transaction pooler.
- Verified the hosted Neon connection and both transaction-local timeout values
  using read-only queries. Backend regression suite passed (21 tests); cloud
  redeployment and final live checks follow this pooler repair.

- The pooler-compatible backend deployed successfully and `/health` returned 200.
  The frontend's internal binding still failed, so cloud API ingress now routes
  directly to FastAPI using Vercel service rewrites. Next.js uses the public app
  origin for server-side calls; local Compose retains direct backend transport.
- Added deployment-time runtime checks for database health, configured session
  endpoints, and the sign-in page, with regression tests for unhealthy/protected
  responses. Setup prompts now identify each requested variable explicitly.


## Production deployment verified — 2026-10-24

- Successfully deployed `dpl_q2jMqNX8YdASZ1oYj1cbm2kuJFjF` and aliased
  `https://watchtower-lyart.vercel.app`.
- The deploy script's runtime checks passed: `/health` reports database readiness,
  `/api/session` reports configured authentication, and `/login` returns 200.
- Verified unauthenticated overview redirects to sign-in, password login issues a
  session cookie, the session authenticates, and overview/tasks/bots/projects/
  monitoring all render with HTTP 200 over the public production domain.
- Local checks passed: TypeScript, frontend rendering/origin tests, deployment
  staging/runtime tests, 21 backend regression tests, and 3 real PostgreSQL contract
  tests. The hosted Neon pooler was also tested with read-only queries.
- Cloud storage is the newly provisioned Neon database. Existing Docker/SQLite
  records were not imported or replaced as part of these deployment repairs.


## Python deployment helper — 2026-10-24

- Replaced the JavaScript deployment helper with `tools/deploy_vercel.py` and
  updated `npm run deploy:vercel` to invoke the repository's Python virtualenv.
- Preserved project linking, safe source staging, Production validation, interactive
  setup, non-exportable Secret handling, preflight/check modes, runtime health
  verification, and temporary-file cleanup. Uses the existing python-dotenv
  dependency and Python's standard HTTP client; Vercel CLI still handles hosting.
- Replaced the JavaScript tests with Python unittest coverage for staging/ignore
  rules, service build contexts, settings, runtime retries, and private environment
  cleanup before upload. All four tests and the npm upload-check shortcut pass.
- README now shows both direct Python invocation and the existing npm shortcut.
  No production redeployment is needed for this local deployment-tool conversion.
- The Python helper passed a read-only preflight against the linked Vercel project
  and its urllib runtime checks against the live production app. No deployment
  or cloud setting changes were made during this conversion.


## Page navigation performance — 2026-10-24

- Measured authenticated production page responses before changes: overview 1.144s,
  tasks 1.136s (repeat 0.980s), agents 1.073s, monitoring 1.321s; `/api/state`
  took 1.101s. These are HTTP timings from this machine, not browser paint timings.
- Removed the blocking network session check from middleware. Cookie presence is
  only a fast redirect hint; the server dashboard layout verifies the actual
  session alongside page data, and every protected FastAPI endpoint continues to
  authenticate each request. No shared authentication or dashboard-data cache.
- Added a dashboard loading boundary so client navigation can show progress and
  Next.js can prefetch the shared shell instead of leaving the previous view idle.
- PostgreSQL now reuses a bounded pool (maximum four connections per process,
  idle connections released after 60 seconds), checks connection health before
  reuse, and closes the pool on application/CLI shutdown. Transaction timeouts,
  rollback, and exclusive task claims are preserved with Neon-compatible SQL.
- Verification: TypeScript; four frontend rendering/authentication tests; four
  deployment-helper tests; 21 backend regression tests; four real PostgreSQL
  tests, including connection reuse, concurrency, rollback and timeout behavior.
- Exact Vercel service-local frontend Docker build passed. Local Compose was rebuilt
  and all three services are healthy. Authenticated local Docker page responses:
  overview 0.095s, tasks 0.046s, agents 0.035s, monitoring 0.055s; state API 0.034s.
- First cloud deployment passed runtime/authentication checks, but repeated page
  timings still varied around one second, so it is not evidence of a large cloud
  speedup. Follow-up: pipeline SQL setup with reads to remove sequential round
  trips; real PostgreSQL tests and read-only hosted Neon reads passed. Added
  `/api/state` Server-Timing diagnostics for database/projection time, without
  exposing queries or credentials.
- Final production deployment `dpl_DREfHwJ5Dfn5DeaFmAhqButqKtfX` is READY at
  `https://watchtower-lyart.vercel.app`; runtime health/sign-in checks passed.
  Live state API database timings are 10.4–10.7ms and projection 0.2–0.3ms.
  HTTP state samples: 0.546s, 0.567s, 1.017s. Full page responses remain variable
  (usually around 0.5–1.2s, with a 2.276s task-page outlier); these measurements
  do not establish a large overall cloud navigation speedup. Network/platform
  routing remains material: requests from this test location route via bom1 to
  iad1. Browser paint/interaction latency has not been measured.
- Invalid-session `/tasks` redirects to `/login` (307); the state API rejects it
  with 401. The local updated backend remains healthy; its state diagnostic read
  was 2.3ms with a 0.4ms projection. No production records were modified by checks.


## Further latency optimization — 2026-10-24

- Profiled browser navigation, not just HTTP responses. An initial Playwright
  click-based sample included automation waits; subsequent measurements time DOM
  activation to the destination heading plus two animation frames inside Chrome.
- Found local RSC data fetches completing in 21–53ms while destination pages
  appeared after 326–333ms. Testing removal of the blanket dashboard loading
  boundary to avoid this rendering delay. Sidebar links now show an accessible
  pending spinner while retaining the existing view during navigation.
- Added server-only verification of FastAPI's existing HMAC v2 session tokens
  when shared server credentials are present (as on Vercel). This removes the
  `/api/session` round trip from dashboard rendering. Compose retains backend
  validation when its frontend has no credentials. API auth remains independent;
  no shared dashboard cache or client-visible secret is introduced.
- Auth coverage includes a token generated by Python, expiry/future limits,
  tampering, version mismatch, password rotation, secret normalization, invalid
  sessions, and HTTP fallback versus local verification.
- Switched both production frontend Dockerfiles to traced Next.js standalone
  output and direct Node startup. Service-local image size fell from 880,506,829
  bytes to 307,814,999 bytes (65% smaller); the exact Vercel image passed browser
  navigation checks without JavaScript errors. Local Compose is also using the
  standalone runtime.
- Monitoring now buckets each timestamp once instead of rescanning all events
  for every hourly heatmap cell. A 3,000-event comparison returned identical
  results and fell from 829.3ms to 6.2ms on this machine. Added coverage for timezone
  boundaries, historical events, and avoiding double-counting approved tasks.
- Checks so far: TypeScript, six frontend tests, four deployment-helper tests,
  and 22 backend tests pass (four PostgreSQL-only tests skipped in the plain run).
- Confirmed the loading boundary was contributing to latency: with the same local
  browser/data, removing it reduced click-to-paint from 326–333ms to 168/61/79/45/
  74ms across tasks, agents, monitoring, projects, and tasks again (median 74ms).
  RSC requests remained about 18–46ms. Removed that boundary; the sidebar pending
  indicator now reports navigation progress without replacing the entire page.
- First optimized standalone/auth/monitoring deployment
  `dpl_7sPN6dZCuRgf8za15wmCdJWakr7U` passed production runtime checks. Follow-up
  deployment includes the measured loading-boundary removal and is verified below.
- Browser check with a deliberately delayed RSC response verified that the
  accessible “Opening Tasks” status appears, the previous page remains visible,
  and navigation completes successfully. No browser JavaScript errors were seen
  in the navigation runs. Local Compose health checks pass for all three services.

- Final deployment `dpl_95Uy7PyaxwNCzoYrjLVDG2GKx2Ee` is READY at
  `https://watchtower-lyart.vercel.app`. Health, login, invalid-session redirects,
  API 401 rejection, authenticated rendering and private no-store responses pass.
  Hosted state diagnostic: database 11.1ms, projection 0.3ms.
- Corrected Chrome click-to-paint baseline (before this optimization batch):
  4661/1612/830/1297/1215ms, median 1297ms. Final two runs:
  990/1081/798/914/1398ms and 827/1063/964/1131/864ms, median 977ms combined
  (about 25% lower in these samples). No browser JavaScript errors. Samples are
  small and network conditions vary; this is not a guaranteed per-route speedup.
- Local median decreased from roughly 330ms to 74ms with the loading-boundary
  adjustment. Larger monitoring histories benefit from the separately measured
  aggregation speedup. No database records were changed by browser/API checks.


## Telegram, WhatsApp and Slack channels — 2026-10-24

- Added one optional messaging connection per agent, with provider/destination,
  trusted sender IDs, Slack workspace / WhatsApp phone-number routing, and BOT_
  environment-variable references. Credential values are not stored in state or
  sent to the UI. Added Telegram and WhatsApp creation choices, post-create setup
  navigation, platform filtering, channel health, delivery history and retry UI.
- Added Telegram secret-header, Slack raw-body HMAC + timestamp, and WhatsApp
  app-secret HMAC webhooks plus WhatsApp subscription verification. Events are
  scoped to the configured chat/channel/account and allowed senders. Transactional
  receipts deduplicate retries and Slack message/mention echoes.
- Verified chat commands drive the existing accept/start/progress/block/reject/
  submit lifecycle; submissions enter Review and dashboard operators approve or
  request changes. Commands cannot approve work or alter another agent's tasks.
  Native replies and explicit /reply commands connect chat to operator messages.
- Added a durable transactional outbox for messages, assignments, comments,
  reassignment and review feedback. Claims use leases; network sends run outside
  DB locks. Rate limits defer delivery, ambiguous outcomes require an explicit
  operator retry, and connection changes cancel unsent work for the old destination.
  Long messages are chunked in order. WhatsApp signed receipts add delivered/read
  state; other provider acceptance is labeled sent rather than delivered.
- API writes attempt background dispatch. Docker now includes a five-second channel
  worker; /api/cron also dispatches for externally scheduled hosted deployments.
  Connect/Messages offer manual dispatch and failure inspection. Internal delivery
  history/receipt collections are excluded from routine dashboard state responses.
- Existing version-1 state remains compatible; new internal collections are optional
  for legacy reads and default during imports. Existing task/runtime APIs remain.
- Added docs/MESSAGING_CHANNELS.md, README setup links, and backend env examples.
  Documented provider account/subscription setup, public HTTPS callbacks, Telegram
  bot-to-bot restrictions, WhatsApp Business templates/window, Slack mention syntax,
  durable hosting scheduler requirements and the continued need for a work runtime.
- Checks: TypeScript and six frontend tests; four deployment-helper tests; 38 backend
  tests (five PostgreSQL-only tests skipped in the plain run); all five real
  PostgreSQL tests pass, including simultaneous delivery claims and duplicate receipt
  handling. The exact service-local Vercel frontend image builds successfully.
- Isolated Chrome workflow passed create/configure/assign/report/submit/review/
  message/history using a disposable SQLite test API with mocked provider sends.
  No real provider account was contacted for bot delivery verification.
- Automatic review initially blocked worker startup because of potential existing
  queued sends. Read-only inspection established zero connections, zero pending
  deliveries and zero BOT_ credentials locally; production also had zero agents/
  connections. Startup then passed review; the local API/frontend/DB/worker are
  healthy. Existing local and production records were not changed by UI tests.
- Deployment `dpl_2VDN4HcQmvdScr2veFHFHi99pEG8` is READY at
  `https://watchtower-lyart.vercel.app`; the deploy helper's health/session/login
  checks passed. Follow-up read-only checks verified channel-admin authentication,
  registered channel/delivery/webhook routes, agents/messages/monitoring pages,
  and internal queue/receipt filtering. No production agents were created for tests.
- Slack and WhatsApp connection forms also passed isolated Chrome checks. Temporary
  test containers were removed. Final local frontend/API/PostgreSQL/channel-worker
  health checks pass. Live provider delivery awaits account credentials/webhooks;
  unattended hosted retries require the documented protected cron scheduler.
