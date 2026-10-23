# Watch Tower

An AI workforce control app with a **Next.js frontend** and a **FastAPI backend**.

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

The new backend uses SQLite at `backend/data/watchtower.sqlite3`, configurable via
`WATCHTOWER_DATABASE`. It does not automatically read or change live Blob data.
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

## Deployment

```bash
# Requires Docker Compose supporting optional env_file entries.
docker compose --env-file /dev/null up --build
```

Set `backend/.env` first. Single-quote any scrypt hash value in that file so Compose
does not expand its dollar signs. The explicit empty CLI env file prevents Compose
from automatically parsing the unchanged legacy root `.env`. The backend container mounts a named volume at `/data`;
the frontend receives only `BACKEND_URL=http://backend:8000`. The images have separate
Dockerfiles and can be deployed independently. SQLite requires a durable filesystem
on one host/shared volume; independent replicas with separate disks would diverge.
Use HTTPS and set `PUBLIC_APP_URL` and `COOKIE_SECURE=1` for production.

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
