"""Backend-only configuration. Never serialize credential values to the UI."""
from dataclasses import dataclass
import os
from pathlib import Path
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent

@dataclass(frozen=True)
class Settings:
    database_path: Path = ROOT / "data/watchtower.sqlite3"
    password: str = ""
    password_hash: str = ""
    master_key: str = ""
    cron_secret: str = ""
    public_url: str = "http://localhost:3000"
    cookie_secure: bool = False
    seed_snapshot: bool = True
    integration_env: dict | None = None

    @classmethod
    def from_env(cls):
        values = {}
        env_files = [REPO / ".env", REPO / ".env.local", ROOT / ".env", ROOT / ".env.local"] if os.environ.get("WATCHTOWER_ENV_FILES", "1") != "0" else []
        for file in env_files:
            values.update({k: v for k, v in dotenv_values(file).items() if v is not None})
        values.update(os.environ)
        return cls(
            database_path=Path(values.get("WATCHTOWER_DATABASE", str(ROOT / "data/watchtower.sqlite3"))).resolve(),
            password=values.get("DASHBOARD_PASSWORD", ""), password_hash=values.get("DASHBOARD_PASSWORD_HASH", ""),
            master_key=values.get("WATCHTOWER_API_KEY", ""), cron_secret=values.get("CRON_SECRET", ""),
            public_url=values.get("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/"),
            cookie_secure=values.get("COOKIE_SECURE", "0") == "1",
            seed_snapshot=values.get("WATCHTOWER_SEED_FROM_SNAPSHOT", "1") == "1", integration_env=values,
        )
