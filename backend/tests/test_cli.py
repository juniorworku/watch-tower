import json
import os
from pathlib import Path
import subprocess
import sys
from backend.app.seed import empty_state


def test_explicit_cli_import_export_preserves_state_and_refuses_replacement(tmp_path):
    state = empty_state()
    state["agents"] = [{"id": "legacy-id", "name": "Preserved"}]
    source, destination = tmp_path / "input.json", tmp_path / "output.json"
    source.write_text(json.dumps(state))
    command = [sys.executable, "-m", "backend.app.cli", "--database", str(tmp_path / "state.sqlite3")]
    env = {**os.environ, "WATCHTOWER_ENV_FILES": "0"}
    subprocess.run(command + ["import-state", str(source)], env=env, capture_output=True, text=True, check=True)
    subprocess.run(command + ["export-state", str(destination)], env=env, capture_output=True, text=True, check=True)
    assert json.loads(destination.read_text())["agents"][0]["id"] == "legacy-id"
    assert destination.stat().st_mode & 0o777 == 0o600
    replacement = subprocess.run(command + ["import-state", str(source)], env=env, capture_output=True, text=True)
    assert replacement.returncode != 0 and "--replace" in replacement.stderr
    assert subprocess.run(command + ["import-state", str(source), "--replace"], env=env, capture_output=True).returncode == 0
