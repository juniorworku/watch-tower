# Watch Tower

An AI workforce control app with a **Next.js frontend**, **FastAPI backend**, and **PostgreSQL database** in Docker.

```text
frontend/          Next.js pages, components, types, and HTTP transport
backend/app/       FastAPI routers, auth, domain services, integrations, persistence
backend/tests/     Backend API, workflow, auth, and concurrency tests
backend/runtime/   Downloadable agent runner and optional schedule worker
backend/content/   Vault snapshot and provider setup metadata
frontend/tests/    Server-rendered UI smoke tests
tools/            Read-only Blob migration and stack smoke tools
docs/             Architecture, feature guide, and migration progress
```

The existing task board, agents, project teams, reviews, templates, schedules,
messages, monitoring, vault pages, and read-only integrations are retained.
FastAPI is the sole owner of authentication, credentials, workflow decisions,
persistence, and provider access. Next.js calls it over HTTP.

## Docker deployment with PostgreSQL

Docker Compose runs Next.js, FastAPI, and PostgreSQL 17. The database has a named
volume; it is not exposed on a host port. The UI defaults to
<http://localhost:3002> and the API to <http://127.0.0.1:8001/docs>, avoiding the
existing development servers.

### Everyday commands

For an already configured installation, start with:

```bash
docker compose up
```

This runs in the foreground and shows logs. To rebuild and run in the background:

```bash
docker compose up -d --build
```

To start in the background without rebuilding:

```bash
docker compose up -d
```

Open <http://localhost:3002> and use your configured dashboard password.
Check service health with `docker compose ps`.

### First-time setup only

Skip this section when `backend/.env.docker` and `backend/.env.postgres` already
exist. Existing installations do not need to run setup or migration again.

Requirements: Docker Engine with Docker Compose v2+, and Python 3.12+ for the
one-time setup helper. Run commands from the repository root. If you do not yet
have a Python environment:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
```

For a fresh checkout without backend credentials, copy
`backend/.env.example` to `backend/.env` and set a dashboard password there.
Keep existing environment files when upgrading.

For first-time setup, configure your dashboard credentials in `backend/.env`
(or keep your existing root/local settings), then run:

```bash
.venv/bin/python tools/prepare-docker.py
docker compose up -d --build
```

The setup command generates private, ignored `backend/.env.docker` and
`backend/.env.postgres` files. It copies effective application settings and generates
a PostgreSQL password, without changing the original env files. It refuses to
replace existing Docker credentials. Edit these generated files to change Docker
settings. Do not regenerate the database password after initializing its volume.
The frontend receives only the internal `BACKEND_URL`; secrets and local databases
are excluded from image build contexts. If your root `.env` contains a password
hash or another value with `$`, single-quote that whole value so Compose keeps it
literal.

### One-time SQLite migration

Skip this section if your data is already in PostgreSQL.
To migrate an existing SQLite installation, import **before starting the backend**
instead of using the first-time `up` command above:

```bash
# Export preserves the original SQLite database. Choose a new export filename.
.venv/bin/python -m backend.app.cli --database data/watchtower.sqlite3 export-state exports/docker-migration.json
docker compose build
docker compose up -d --wait db
docker compose run --rm --no-deps -v "$PWD/exports:/import:ro" backend python -m backend.app.cli import-state /import/docker-migration.json
docker compose up -d --wait
```

Use `backend/data/watchtower.sqlite3` instead when that is your existing database.
Import refuses to overwrite a nonempty target. Docker starts with an empty database
until imported or populated through the UI. `DATABASE_URL` selects PostgreSQL;
without it, local development retains SQLite compatibility. The adapters preserve
the same records and transactional behavior.

### Logs and stopping

```bash
docker compose ps
docker compose logs --tail 100 backend frontend db
docker compose stop    # preserves database volume
docker compose up -d
```

### PostgreSQL backup

Database backup (run from the repo root; exports contain private data):

```bash
mkdir -p exports
(umask 077; docker compose exec -T db pg_dump -U watchtower -d watchtower -Fc > exports/watchtower.dump)
```

Keep the named PostgreSQL volume; `docker compose down -v` deletes it. To change
ports, set `WATCHTOWER_FRONTEND_PORT` / `WATCHTOWER_BACKEND_PORT` in your shell and
align `PUBLIC_APP_URL` in `backend/.env.docker`. Use HTTPS and
`COOKIE_SECURE=1` for production behind a reverse proxy.

### If a one-time command reports existing data

- **Docker environment files already exist:** setup is complete; keep those files
  and use `docker compose up`.
- **Export file already exists:** keep the existing backup, or choose a new filename
  if you intentionally need another export.
- **Database contains records:** the target is populated. For an already migrated
  installation, skip import and start normally. Do not use `--replace` merely to
  bypass this protection.

### Deployment notes

Docker Compose remains the local deployment. For Vercel, use the deployment script
below: it deploys both HTTP containers and connects them to managed PostgreSQL.
The frontend proxy keeps browser requests on one origin. FastAPI independently
authorizes requests.

Agent execution still requires configuring the downloaded runner's local commands.
Recurring jobs still require connected agent heartbeats or an authenticated cron
worker. The worker now lives at `backend/runtime/run-automation.mjs`.

## Deploy to Vercel in one command

After the one-time account/database setup below, run:

```bash
npm run deploy:vercel
```

This deploys both Next.js and FastAPI as Docker-based HTTP services in a single
Vercel production project. `vercel.json` routes `/api/*` and `/health` directly
to FastAPI, and other paths to Next.js. Server rendering and middleware call the
API on `PUBLIC_APP_URL`, keeping browser requests and cookies on one domain. The script prints Vercel's
resulting deployment URL and checks `/health`, `/api/session`, and `/login` before
reporting runtime verification as successful.
Each Vercel Docker build uses its service folder as the context: `frontend/`
contains its own lockfile, and `backend/` contains its own Python requirements.
The Vercel Dockerfiles do not rely on files above those folders. Local Compose
continues using the separate repository-root Docker build configuration.

Vercel [Container Runtime](https://vercel.com/docs/functions/runtimes/container)
and [Services](https://vercel.com/docs/services) are beta features. Vercel does not
run Compose or persistent PostgreSQL containers: use a managed PostgreSQL database
and keep Compose for local development.

### One-time Vercel setup

1. Install Node.js 22.12+ and the current CLI, then sign in:

   ```bash
   npm install -g vercel
   vercel login
   ```

2. Create/select a Vercel project named `watchtower` with the repository root as
   its root directory. Enable access to Services/Container Runtime if your account
   requires it. Do not configure the project root as `frontend/`.
3. Provision managed PostgreSQL and add these **Production** environment variables
   in that project's Vercel settings:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Hosted PostgreSQL connection URL, with the provider's required TLS settings |
   | `DASHBOARD_PASSWORD_HASH` | Your production scrypt hash; store as a Secret. `DASHBOARD_PASSWORD` is also supported |
   | `PUBLIC_APP_URL` | Your production HTTPS domain; store as readable Config |
   | `WATCHTOWER_API_KEY` | Optional production master key for bot provisioning |
   | `CRON_SECRET` | Required if an external scheduler calls `/api/cron` |

   Add provider credentials only for integrations you intend to use. Do not set
   `BACKEND_URL`; server-side API calls use `PUBLIC_APP_URL` on Vercel. Container defaults set
   `COOKIE_SECURE=1`, `WATCHTOWER_ENV_FILES=0`, and
   `WATCHTOWER_SEED_FROM_SNAPSHOT=0`.
4. Run `npm run deploy:vercel`. For a different project/team, set
   `WATCHTOWER_VERCEL_PROJECT` and optionally `WATCHTOWER_VERCEL_SCOPE` on the first
   run. The script remembers its project link under ignored
   `.vercel/watchtower/project.json`, independently of older root project links.

The deployment script stages only application source. Local dotenv files,
PostgreSQL credentials, SQLite databases, exports, and dependency/build folders
are excluded. It checks the configured Production variables without printing their
values, deletes the temporary environment file before upload, and removes staging
files afterwards. Non-exportable Vercel Secrets are checked for presence; their
actual values are validated by the running service.

Check the upload locally without logging in or deploying:

```bash
npm run deploy:vercel -- --check
node --test tools/deploy-vercel.test.mjs
```

If the project exists but deployment stops because Production settings are missing,
run the guided setup in your terminal:

```bash
npm run deploy:vercel -- --setup
```

Vercel prompts for missing settings only, stores the database URL and dashboard
password as Secrets, then the script deploys. You must obtain a hosted PostgreSQL
URL first; it cannot use the local Compose database. Find your production domain
under the project's **Domains** page for `PUBLIC_APP_URL`. Existing settings are
kept. You can also enter these values directly in Vercel's Environment Variables
page; choose Production as the target environment.

Check the linked project's Production settings without publishing:

```bash
npm run deploy:vercel -- --preflight
```

If deployment reports missing variables, open the linked Vercel project's
**Settings → Environment Variables**, add them for **Production**, and rerun the
command. Editing local `.env` files does not configure Vercel. The `db:5432` address
in local Docker configuration is not reachable from Vercel; use the URL from your
managed PostgreSQL provider. The optional Codex plugin is not required to deploy;
the script disables optional plugin prompts.

Cloud PostgreSQL starts empty unless you explicitly import data. The script does
not provision a paid database, copy your local records, replace cloud data, or
upload your local passwords. To migrate records, use the existing export/import
CLI against the intended cloud database as a separate, explicit cutover step.
Keep your Compose database and private backups until you verify the cloud app.

Vercel project variables are shared by its services and remain server-side; never
prefix backend credentials with `NEXT_PUBLIC_`. This deployment uses the Next.js
container rather than a native Next.js service so middleware and server rendering
run inside the same container. The Vercel frontend image enables
`WATCHTOWER_API_SAME_ORIGIN=1` to select the public API origin. Container scale
and request limits apply; unattended agents and recurring workers still require
an appropriate external runner/scheduler.

## Local development

Requirements: Python 3.12+, Node.js 22.12+, npm.
Run all commands below from the repository root.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
.venv/bin/pip install -r backend/requirements-dev.txt
npm ci
```

For a new installation, copy the examples and configure a backend password:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Existing root `.env` and `.env.local` files can supply backend
settings during migration. Backend `.env`/`.env.local` override those files, and
process environment variables override files. Do not overwrite existing credentials
with example values. `WATCHTOWER_ENV_FILES=0` disables dotenv loading for deployments
that inject settings through process environment variables.

Start the services in separate terminals:

```bash
# Terminal 1 — backend, port 8000
.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000

# Terminal 2 — frontend, port 3000
npm run dev
```

Open <http://localhost:3000>. FastAPI health: <http://127.0.0.1:8000/health>.
Interactive backend API docs: <http://127.0.0.1:8000/docs>.

`BACKEND_URL` belongs to the frontend server environment and defaults to
`http://127.0.0.1:8000`. `PUBLIC_APP_URL` belongs to the backend and is the URL used
in generated runtime files. Keep it aligned with the public frontend URL.

## Legacy Blob migration

Outside Docker, local development uses SQLite at `backend/data/watchtower.sqlite3`, configurable via
`WATCHTOWER_DATABASE`. It does not automatically read or change live Blob data.
If an existing installation has `data/watchtower.sqlite3` at the repository root
and no database at the new location, the backend continues using that existing
database. An explicit `WATCHTOWER_DATABASE` always takes precedence.
Stop old-version writers before taking the final export. Import **before starting
the new API** to avoid seeding the destination with snapshot records.

```bash
# Read-only remote export; private local file, refuses to overwrite an existing file.
node --env-file=.env --env-file=.env.local tools/export-blob.mjs exports/state.json

# Import into the configured database; preserves IDs, history, and key hashes.
.venv/bin/python -m backend.app.cli import-state exports/state.json
```

Use only the `--env-file` arguments for files present on your machine. If the target
database already contains records, take a backup and explicitly use `--replace`
when you intend to replace them. Export an existing SQLite state for backup with:

```bash
.venv/bin/python -m backend.app.cli export-state exports/sqlite-backup.json
```

The legacy Blob objects are never deleted or written by the export tool. Existing
v1 dashboard sessions require a fresh login. Existing master and scoped bot keys
continue to work after importing their records. API paths remain `/api/*`, either
through the frontend proxy or directly on FastAPI.

## Verification

```bash
.venv/bin/python -m pytest backend/tests -q
npm test
npm run typecheck
npm run build

# After the frontend production build: launches both services against a temporary DB.
.venv/bin/python tools/smoke-stack.py
```

The backend tests use temporary SQLite databases and test credentials. The stack
smoke script checks authentication, cookie forwarding, server rendering, task
creation, and agent pickup over real HTTP; it shuts both processes down afterwards.

## More documentation

- [Architecture and API ownership](docs/ARCHITECTURE.md)
- [Migration progress and validation](docs/MIGRATION_PROGRESS.md)
- [Workforce feature and runtime guide](docs/FEATURES.md)
