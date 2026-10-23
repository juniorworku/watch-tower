"""Real PostgreSQL contract tests; opt in inside the backend container."""
from concurrent.futures import ThreadPoolExecutor
import os
import unittest
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.domain import DomainError, claim_next, create_task
from backend.app.admin import save_agent
from backend.app.main import create_app
from backend.app.repository import PostgresRepository
from backend.app.seed import empty_state


@unittest.skipUnless(os.environ.get("WATCHTOWER_TEST_POSTGRES") == "1", "requires disposable PostgreSQL test database")
class PostgresTests(unittest.TestCase):
    def setUp(self):
        self.source = os.environ["DATABASE_URL"]
        self.name = "watchtower_test_" + uuid4().hex
        with psycopg.connect(self.source, autocommit=True) as connection:
            connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(self.name)))
        self.addCleanup(self.drop_database)
        params = conninfo_to_dict(self.source)
        params["dbname"] = self.name
        self.url = make_conninfo(**params)
        self.repository = PostgresRepository(self.url)
        # Concurrent initializers must seed only once without DDL races.
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(lambda _: self.repository.initialize(), range(3)))

    def drop_database(self):
        with psycopg.connect(self.source, autocommit=True) as connection:
            connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(self.name)))

    def test_concurrent_claims_rollback_persistence_and_import(self):
        for name in ("A", "B"):
            self.repository.mutate(lambda s, n=name: save_agent(s, {"name": n}))
        self.repository.mutate(lambda s: create_task(s, {"title": "Exclusive"}))
        ids = [agent["id"] for agent in self.repository.read()["agents"]]
        with ThreadPoolExecutor(max_workers=2) as pool:
            claimed = list(pool.map(lambda a: self.repository.mutate(lambda s: claim_next(s, a)), ids))
        self.assertEqual(sum(result is not None for result in claimed), 1)
        before = self.repository.read()
        def fail(state):
            state["tasks"].clear()
            raise DomainError("rollback")
        with self.assertRaises(DomainError):
            self.repository.mutate(fail)
        self.assertEqual(PostgresRepository(self.url).read(), before)
        with self.assertRaises(DomainError):
            self.repository.import_state(empty_state())
        document = empty_state()
        document["agents"] = [{"id": "preserved", "name": "Imported"}]
        self.repository.import_state(document, replace=True)
        self.assertEqual(self.repository.read()["agents"][0]["id"], "preserved")

    def test_api_login_task_and_readiness(self):
        settings = Settings(database_url=self.url, password="postgres-test", seed_snapshot=False, integration_env={})
        with TestClient(create_app(settings)) as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.get("/api/tasks").status_code, 401)
            response = client.post("/api/login", data={"password": "postgres-test"}, follow_redirects=False)
            self.assertEqual(response.status_code, 303)
            self.assertTrue(client.get("/api/session").json()["authenticated"])
            self.assertEqual(client.post("/api/tasks", json={"title": "PostgreSQL task"}).status_code, 201)
        self.assertEqual(len(self.repository.read()["tasks"]), 1)
