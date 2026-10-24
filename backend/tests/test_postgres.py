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
        self.addCleanup(self.repository.close)
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
        other = PostgresRepository(self.url)
        try:
            self.assertEqual(other.read(), before)
        finally:
            other.close()
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

    def test_timeouts_are_applied_in_transaction_not_startup_options(self):
        with self.repository.connect() as connection:
            self.assertEqual(connection.execute("SHOW lock_timeout").fetchone()[0], "15s")
            self.assertEqual(connection.execute("SHOW statement_timeout").fetchone()[0], "30s")

    def test_reads_reuse_connections_and_shutdown(self):
        # Separate pool avoids relying on ordering of the concurrent startup pool.
        repository = PostgresRepository(self.url)
        self.addCleanup(repository.close)
        repository.read()
        with repository.connect() as connection:
            first = connection.info.backend_pid
        repository.read()
        with repository.connect() as connection:
            self.assertEqual(connection.info.backend_pid, first)
        self.assertEqual(repository.pool.get_stats()["connections_num"], 1)
        repository.close()
        self.assertTrue(repository.pool.closed)

    def test_channel_claims_and_receipts_are_transactional(self):
        from backend.app.channels import claim_delivery, receive, save_connection
        from backend.app.admin import send_message
        agent = self.repository.mutate(lambda s: save_agent(s, {'name': 'Telegram worker'}))
        config = self.repository.mutate(lambda s: save_connection(s, agent['id'], {'provider': 'telegram', 'destination': '123', 'allowedSenders': ['42'], 'tokenEnv': 'BOT_TOKEN', 'secretEnv': 'BOT_SECRET'}))
        self.repository.mutate(lambda s: send_message(s, {'agentId': agent['id'], 'text': 'One notification'}))
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda _: self.repository.mutate(claim_delivery), range(2)))
        self.assertEqual(sum(c is not None for c in claims), 1)
        item = {'id': 'event-1', 'sender': '42', 'text': '/heartbeat', 'replyTo': ''}
        with ThreadPoolExecutor(max_workers=2) as pool:
            received = list(pool.map(lambda _: self.repository.mutate(lambda s: receive(s, agent['id'], config['id'], [item])), range(2)))
        self.assertEqual(sorted(received), [0, 1])
        self.assertEqual(len(self.repository.read()['channelReceipts']), 1)
