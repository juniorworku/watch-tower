"""Explicit offline state import/export. Does not access or mutate Blob storage."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
from .config import Settings
from .repository import Repository, create_repository
from .seed import empty_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, help="SQLite path (defaults to backend settings)")
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import-state")
    importer.add_argument("file", type=Path)
    importer.add_argument("--replace", action="store_true", help="Explicitly replace existing records after taking a backup")
    exporter = commands.add_parser("export-state")
    exporter.add_argument("file", type=Path)
    hasher = commands.add_parser("hash-password")
    hasher.add_argument("file", type=Path)
    args = parser.parse_args()
    if args.command == "hash-password":
        password = getpass.getpass("Dashboard password: ")
        if not password:
            parser.error("password cannot be empty")
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64*1024*1024)
        with open(args.file, "x", opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
            output.write(f"scrypt${salt.hex()}${digest.hex()}\n")
        print(f"Password hash written to {args.file}; keep this file private.")
        return
    repository = Repository(args.database, empty_state) if args.database else create_repository(Settings.from_env(), empty_state)
    try:
        repository.initialize()
        if args.command == "import-state":
            counts = repository.import_state(json.loads(args.file.read_text()), replace=args.replace)
            print("Imported records: " + ", ".join(f"{key}={count}" for key, count in counts.items()))
        else:
            args.file.parent.mkdir(parents=True, exist_ok=True)
            with open(args.file, "x", opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
                json.dump(repository.read(), output, indent=2)
            print(f"Exported state to {args.file}; contains private data and credential hashes.")
    finally:
        repository.close()

if __name__ == "__main__":
    main()
