"""Transactional state storage with PostgreSQL and legacy SQLite adapters."""
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
from .domain import COLLECTIONS, DomainError, now_iso, project_for
from .seed import empty_state


def validate_state(value):
    if not isinstance(value, dict) or value.get("version") != 1:
        raise DomainError("Expected a version 1 Watch Tower state document")
    state = deepcopy(value)
    for key in COLLECTIONS:
        rows = state.setdefault(key, [])
        if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows):
            raise DomainError(f"{key} must contain records with string IDs")
        if len({r["id"] for r in rows}) != len(rows):
            raise DomainError(f"duplicate IDs in {key}")
    for project in state["projects"]:
        if "memberIds" not in project:
            project["memberIds"] = list({t["assigneeId"] for t in state["tasks"] if t.get("assigneeId") and (t.get("projectId") == project["id"] or t.get("project", "").lower() == project["name"].lower())})
    for task in state["tasks"]:
        if not task.get("projectId"):
            task["projectId"] = (project_for(state, task) or {}).get("id")
    return state


class Repository:
    def close(self):
        """SQLite connections are scoped to each operation."""

    def __init__(self, path: Path, seed=empty_state):
        self.path = Path(path)
        self.seed = seed

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        connection.execute("PRAGMA busy_timeout=15000")
        try:
            yield connection
        finally:
            connection.close()

    def initialize(self):
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL)")
            connection.execute("BEGIN IMMEDIATE")
            try:
                if not connection.execute("SELECT 1 FROM state WHERE id=1").fetchone():
                    seed = validate_state(self.seed())
                    connection.execute("INSERT INTO state VALUES (1, 1, ?)", (json.dumps(seed),))
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def read(self):
        with self.connect() as connection:
            row = connection.execute("SELECT document FROM state WHERE id=1").fetchone()
            if not row:
                raise RuntimeError("Database is not initialized")
            return json.loads(row[0])

    def mutate(self, operation):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                state = json.loads(connection.execute("SELECT document FROM state WHERE id=1").fetchone()[0])
                result = operation(state)
                state["updatedAt"] = now_iso()
                connection.execute("UPDATE state SET revision=revision+1, document=? WHERE id=1", (json.dumps(state),))
                connection.commit()
                return deepcopy(result)
            except Exception:
                connection.rollback()
                raise

    def import_state(self, state, replace=False):
        validated = validate_state(state)
        def import_document(current):
            if not replace and any(current[k] for k in COLLECTIONS):
                raise DomainError("Database contains records; back it up and use --replace to import", 409)
            current.clear()
            current.update(validated)
            return {key: len(validated[key]) for key in COLLECTIONS}
        return self.mutate(import_document)


class PostgresRepository(Repository):
    def __init__(self, database_url, seed=empty_state):
        from psycopg_pool import ConnectionPool
        self.database_url = database_url
        self.seed = seed
        # Small per-process pool; release idle connections so hosted DBs can sleep.
        self.pool = ConnectionPool(database_url, open=False, min_size=0, max_size=4,
                                   max_idle=60, timeout=10, max_waiting=32,
                                   kwargs={"connect_timeout": 10, "prepare_threshold": None},
                                   check=ConnectionPool.check_connection)

    def close(self):
        self.pool.close()

    @contextmanager
    def connect(self):
        self.pool.open()
        with self.pool.connection() as connection:
            # Pipeline BEGIN/settings/queries together rather than waiting for
            # each setup round trip. Fetches synchronize before using results.
            with connection.pipeline():
                # Transaction-pooling endpoints reject startup timeout options.
                connection.execute("SET LOCAL lock_timeout = '15s'")
                connection.execute("SET LOCAL statement_timeout = '30s'")
                yield connection

    def initialize(self):
        from psycopg.types.json import Jsonb
        with self.connect() as connection:
            # Serialize schema creation/seeding across simultaneous API starts.
            connection.execute("SELECT pg_advisory_xact_lock(718274901)")
            connection.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision BIGINT NOT NULL, document JSONB NOT NULL)")
            if not connection.execute("SELECT 1 FROM state WHERE id=1").fetchone():
                connection.execute("INSERT INTO state VALUES (1, 1, %s)", (Jsonb(validate_state(self.seed())),))

    def read(self):
        with self.connect() as connection:
            row = connection.execute("SELECT document FROM state WHERE id=1").fetchone()
            if not row:
                raise RuntimeError("Database is not initialized")
            return row[0]

    def mutate(self, operation):
        from psycopg.types.json import Jsonb
        with self.connect() as connection:
            row = connection.execute("SELECT document FROM state WHERE id=1 FOR UPDATE").fetchone()
            if not row:
                raise RuntimeError("Database is not initialized")
            state = row[0]
            result = operation(state)
            state["updatedAt"] = now_iso()
            connection.execute("UPDATE state SET revision=revision+1, document=%s WHERE id=1", (Jsonb(state),))
            return deepcopy(result)


def create_repository(settings, seed=empty_state):
    if settings.database_url:
        return PostgresRepository(settings.database_url, seed)
    return Repository(settings.database_path, seed)
