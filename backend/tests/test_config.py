from pathlib import Path

from backend.app import config
from backend.app.repository import PostgresRepository, create_repository


def test_backend_root_points_to_backend():
    assert config.ROOT == Path(config.__file__).resolve().parent.parent
    assert config.REPO == config.ROOT.parent


def test_database_url_selects_postgres_without_sqlite_fallback(monkeypatch):
    monkeypatch.setenv("WATCHTOWER_ENV_FILES", "0")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/watchtower_test")
    settings = config.Settings.from_env()
    repository = create_repository(settings)
    assert isinstance(repository, PostgresRepository)
    assert repository.database_url == "postgresql://localhost/watchtower_test"


def test_environment_precedence_and_existing_database(monkeypatch, tmp_path):
    backend = tmp_path / "backend"
    backend.mkdir()
    monkeypatch.setattr(config, "ROOT", backend)
    monkeypatch.setattr(config, "REPO", tmp_path)
    for key in ("WATCHTOWER_ENV_FILES", "DASHBOARD_PASSWORD", "DASHBOARD_PASSWORD_HASH", "WATCHTOWER_DATABASE"):
        monkeypatch.delenv(key, raising=False)
    files = [tmp_path / ".env", tmp_path / ".env.local", backend / ".env", backend / ".env.local"]
    for index, file in enumerate(files):
        file.write_text(f"DASHBOARD_PASSWORD=value-{index}\n")
        assert config.Settings.from_env().password == f"value-{index}"
    monkeypatch.setenv("DASHBOARD_PASSWORD", "process-value")
    assert config.Settings.from_env().password == "process-value"
    legacy = tmp_path / "data/watchtower.sqlite3"
    legacy.parent.mkdir()
    legacy.touch()
    assert config.Settings.from_env().database_path == legacy
    current = backend / "data/watchtower.sqlite3"
    current.parent.mkdir()
    current.touch()
    assert config.Settings.from_env().database_path == current
    monkeypatch.setenv("WATCHTOWER_DATABASE", str(tmp_path / "explicit.sqlite3"))
    assert config.Settings.from_env().database_path == tmp_path / "explicit.sqlite3"
