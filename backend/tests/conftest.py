from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.app.config import Settings
from backend.app.main import create_app

@pytest.fixture
def app(tmp_path):
    return create_app(Settings(database_path=tmp_path / "test.sqlite3", password="test-password", master_key="test-master", cron_secret="test-cron", seed_snapshot=False, integration_env={}))

@pytest.fixture
def client(app):
    with TestClient(app) as value:
        yield value

@pytest.fixture
def logged_in(client):
    response = client.post("/api/login", data={"password": "test-password", "next": "/"}, follow_redirects=False)
    assert response.status_code == 303
    return client

@pytest.fixture
def agent_headers():
    return {"Authorization": "Bearer test-master"}
