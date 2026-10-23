"""Run the built Next.js frontend + FastAPI against a temporary database, then clean up."""
from pathlib import Path
import os
import socket
import subprocess
import sys
import tempfile
import time
import httpx

ROOT = Path(__file__).resolve().parents[1]


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait(url, process, log):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError(f"Service exited: {log.read_text()[-4000:]}")
        try:
            response = httpx.get(url, timeout=1, trust_env=False)
            if response.status_code < 500:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise RuntimeError(f"Service startup timed out: {log.read_text()[-4000:]}")


def main():
    frontend = Path(os.environ.get("WATCHTOWER_SMOKE_FRONTEND", str(ROOT / "frontend")))
    if not (frontend / ".next/BUILD_ID").exists():
        raise RuntimeError("Build the frontend first: npm run build")
    processes = []
    with tempfile.TemporaryDirectory(prefix="watchtower-stack-") as temporary:
        temporary = Path(temporary)
        backend_port, frontend_port = port(), port()
        backend_url, frontend_url = f"http://127.0.0.1:{backend_port}", f"http://127.0.0.1:{frontend_port}"
        env = {**os.environ, "WATCHTOWER_ENV_FILES": "0", "WATCHTOWER_DATABASE": str(temporary / "state.sqlite3"), "WATCHTOWER_SEED_FROM_SNAPSHOT": "0", "DASHBOARD_PASSWORD": "smoke-password", "DASHBOARD_PASSWORD_HASH": "", "WATCHTOWER_API_KEY": "smoke-master", "CRON_SECRET": "smoke-cron", "PUBLIC_APP_URL": frontend_url, "COOKIE_SECURE": "0", "BACKEND_URL": backend_url}
        for key in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "NOTION_TOKEN", "SLACK_BOT_TOKEN"]:
            env[key] = ""
        try:
            with (temporary / "backend.log").open("w") as backend_log, (temporary / "frontend.log").open("w") as frontend_log:
                backend = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)], cwd=ROOT, env=env, stdout=backend_log, stderr=subprocess.STDOUT)
                processes.append(backend)
                wait(backend_url + "/health", backend, temporary / "backend.log")
                front = subprocess.Popen(["node", str(ROOT / "node_modules/next/dist/bin/next"), "start", str(frontend), "--hostname", "127.0.0.1", "--port", str(frontend_port)], cwd=ROOT, env=env, stdout=frontend_log, stderr=subprocess.STDOUT)
                processes.append(front)
                wait(frontend_url + "/login", front, temporary / "frontend.log")
                with httpx.Client(base_url=frontend_url, timeout=20, follow_redirects=False, trust_env=False) as browser:
                    assert browser.get("/api/state").status_code == 401
                    assert browser.get("/").status_code in (302, 307)
                    login = browser.post("/api/login", data={"password": "smoke-password", "next": "/tasks"})
                    assert login.status_code == 303 and login.headers["location"] == "/tasks", login.text
                    assert "wt_session" in browser.cookies and "HttpOnly" in login.headers["set-cookie"]
                    assert browser.get("/api/session").json()["authenticated"]
                    created = browser.post("/api/registry", json={"name": "Smoke agent"})
                    assert created.status_code == 201, created.text
                    agent_id = created.json()["agent"]["id"]
                    created = browser.post("/api/tasks", json={"title": "Proxy round trip", "assigneeId": agent_id})
                    assert created.status_code == 201, created.text
                    task_id = created.json()["task"]["id"]
                    page = browser.get("/tasks")
                    assert page.status_code == 200 and "Proxy round trip" in page.text, page.text[:1000]
                    for path, label in [("/", "Mission control"), ("/monitoring", "Monitoring"), ("/projects", "Projects"), ("/messages", "Agent messages"), ("/automation", "Templates"), ("/docs", "Docs"), ("/memory", "Memory"), ("/integrations", "Integrations")]:
                        response = browser.get(path)
                        assert response.status_code == 200 and label in response.text, f"SSR failed: {path} HTTP {response.status_code}"
                    with httpx.Client(base_url=backend_url, timeout=10, trust_env=False) as direct:
                        assert direct.get("/api/tasks").status_code == 401
                        claim = direct.post(f"/api/agents/{agent_id}/tasks", headers={"Authorization": "Bearer smoke-master"})
                        assert claim.status_code == 200 and claim.json()["task"]["id"] == task_id
                        assert claim.json()["task"]["status"] == "doing"
                    browser.post("/api/logout")
                    assert browser.get("/api/state").status_code == 401
                    backend.terminate()
                    backend.wait(timeout=10)
                    unavailable = browser.get("/")
                    assert unavailable.status_code == 503 and "Backend unavailable" in unavailable.text, f"Unavailable response: {unavailable.status_code}, {unavailable.text[:500]}"
                    assert browser.get("/api/tasks").status_code == 503
                print("PASS: frontend proxy, login/logout cookies, SSR pages, task creation, direct backend authorization, and agent pickup over real HTTP.")
        finally:
            for process in reversed(processes):
                process.terminate()
            for process in reversed(processes):
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

if __name__ == "__main__":
    main()
