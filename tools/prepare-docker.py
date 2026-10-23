"""Create private Docker environment files without changing local configuration."""
import argparse
from pathlib import Path
import secrets
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import dotenv_values, set_key
from backend.app.config import ROOT, REPO, Settings
from backend.app.auth import configured


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend-port", type=int, default=3002)
    args = parser.parse_args()
    if not 1 <= args.frontend_port <= 65535:
        parser.error("frontend port must be between 1 and 65535")
    files = [ROOT / ".env.docker", ROOT / ".env.postgres"]
    if any(path.exists() for path in files):
        parser.error("Docker environment files already exist; edit them explicitly rather than replacing database credentials")
    settings = Settings.from_env()
    if not configured(settings):
        parser.error("Configure a dashboard password in backend/.env first")
    keys = set()
    for base in (REPO, ROOT):
        for name in (".env", ".env.local"):
            path = base / name
            if path.exists():
                keys.update(dotenv_values(path))
    # Copy only application file settings, never the entire shell environment.
    values = {key: str(settings.integration_env[key]) for key in keys if settings.integration_env.get(key) is not None}
    password = secrets.token_hex(32)
    values.update({
        "DASHBOARD_PASSWORD": settings.password,
        "DASHBOARD_PASSWORD_HASH": settings.password_hash,
        "WATCHTOWER_API_KEY": settings.master_key,
        "CRON_SECRET": settings.cron_secret,
        "DATABASE_URL": f"postgresql://watchtower:{password}@db:5432/watchtower",
        "PUBLIC_APP_URL": f"http://localhost:{args.frontend_port}",
        "COOKIE_SECURE": "0",
        "WATCHTOWER_SEED_FROM_SNAPSHOT": "0",
    })
    postgres = {"POSTGRES_DB": "watchtower", "POSTGRES_USER": "watchtower", "POSTGRES_PASSWORD": password}
    for path, content in zip(files, (values, postgres)):
        path.touch(mode=0o600, exist_ok=False)
        for key, value in sorted(content.items()):
            set_key(path, key, value, quote_mode="always")
    print("Created private backend/.env.docker and backend/.env.postgres. Credentials were not printed.")


if __name__ == "__main__":
    main()
