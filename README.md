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

Existing root `.env` and `.env.local` files are unchanged and can supply backend
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

## Existing data migration

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

# Import into SQLite; preserves IDs, task history, messages, and scoped key hashes.
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

## Docker deployment with PostgreSQL

Docker Compose runs Next.js, FastAPI, and PostgreSQL 17. The database has a named
volume; it is not exposed on a host port. The UI defaults to
<http://localhost:3002> and the API to <http://127.0.0.1:8001/docs>, avoiding the
existing development servers.

For an already configured installation, start normally with:

```bash
docker compose up
```

This runs in the foreground and shows logs. To rebuild and run in the background:

```bash
docker compose up -d --build
```

Setup and migration below are **one-time steps**; skip them when your Docker
credentials and migrated PostgreSQL database already exist.

For first-time setup, configure your dashboard credentials in `backend/.env`
(or keep your existing root/local settings), then run:

```bash
.venv/bin/python tools/prepare-docker.py
docker compose up -d --build --wait
```

The setup command generates private, ignored `backend/.env.docker` and
`backend/.env.postgres` files. It copies effective application settings and generates
a PostgreSQL password, without changing the original env files. It refuses to
replace existing Docker credentials. Edit these generated files to change Docker
settings. Do not regenerate the database password after initializing its volume.
The frontend receives only the internal `BACKEND_URL`; secrets and local databases
are excluded from image build contexts. If your root `.env` contains a password
hash or another value with `$`, single-quote that whole value so Compose keeps it
literal. Existing local hash quoting has been corrected without changing credentials.

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

```bash
docker compose ps
docker compose logs --tail 100 backend frontend db
docker compose stop    # preserves database volume
docker compose up -d --wait
```

Database backup (run from the repo root; exports contain private data):

```bash
mkdir -p exports
(umask 077; docker compose exec -T db pg_dump -U watchtower -d watchtower -Fc > exports/watchtower.dump)
```

Keep the named PostgreSQL volume; `docker compose down -v` deletes it. To change
ports, set `WATCHTOWER_FRONTEND_PORT` / `WATCHTOWER_BACKEND_PORT` in your shell and
align `PUBLIC_APP_URL` in `backend/.env.docker`. Use HTTPS and
`COOKIE_SECURE=1` for production behind a reverse proxy.

This is no longer a frontend-only Vercel deployment. You can host Next.js separately,
but FastAPI needs its own Python service and durable database storage. The frontend
proxy avoids a browser cross-origin cookie/CORS setup. Backend authorization applies
even when callers connect to FastAPI directly.

Agent execution still requires configuring the downloaded runner's local commands.
Recurring jobs still require connected agent heartbeats or an authenticated cron
worker. The worker now lives at `backend/runtime/run-automation.mjs`.

- [Architecture and API ownership](docs/ARCHITECTURE.md)
- [Migration progress and validation](docs/MIGRATION_PROGRESS.md)
- [Workforce feature and runtime guide](docs/FEATURES.md)
