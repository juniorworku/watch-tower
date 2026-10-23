import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import pytest
from backend.app import auth
from backend.app.config import Settings
from backend.app.domain import DomainError, create_task, next_occurrence, now_iso, uid
from backend.app.repository import Repository
from backend.app.seed import empty_state


def agent(client, name="Agent", **fields):
    result = client.post("/api/registry", json={"name": name, **fields})
    assert result.status_code == 201, result.text
    return result.json()["agent"]


def task(client, title="Work", **fields):
    result = client.post("/api/tasks", json={"title": title, **fields})
    assert result.status_code == 201, result.text
    return result.json()["task"]


def test_backend_enforces_auth_independently_of_frontend(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/state").status_code == 401
    assert client.post("/api/tasks", json={"title": "Unauthorized"}).status_code == 401
    assert client.get("/api/agents").status_code == 401
    assert not client.get("/api/session").json()["authenticated"]
    bad = client.post("/api/login", data={"password": "wrong", "next": "//evil.test"}, follow_redirects=False)
    assert bad.status_code == 303 and "error=1" in bad.headers["location"]


def test_login_cookie_expiry_logout_and_scrypt_compatibility(logged_in):
    assert logged_in.get("/api/session").json()["authenticated"]
    assert "HttpOnly" in logged_in.post("/api/login", data={"password": "test-password"}, follow_redirects=False).headers["set-cookie"]
    settings = Settings(password="one")
    assert not auth.valid_session(settings, auth.session_token(settings, expires=1))
    token = auth.session_token(settings)
    assert auth.valid_session(settings, token)
    assert not auth.valid_session(Settings(password="two"), token)
    salt = bytes.fromhex("11" * 16)
    digest = hashlib.scrypt(b"password", salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64*1024*1024)
    hashed = Settings(password_hash=f"scrypt${salt.hex()}${digest.hex()}")
    assert auth.check_password(hashed, "password")
    assert not auth.check_password(hashed, "wrong")
    logged_in.post("/api/logout", follow_redirects=False)
    assert logged_in.get("/api/state").status_code == 401


def test_task_review_revisions_and_status_bypass(logged_in, agent_headers):
    client = logged_in
    a = agent(client)
    t = task(client, assigneeId=a["id"], priority="high")
    path = f"/api/agents/{a['id']}"
    assert t["status"] == "assigned"
    assert client.post(path + "/tasks", headers=agent_headers).json()["task"]["status"] == "doing"
    submission = {"taskId": t["id"], "kind": "submitted", "message": "Ready", "deliverable": {"title": "Report", "content": "Evidence"}}
    assert client.post(path + "/activity", headers=agent_headers, json={**submission, "deliverable": {"title": "Bad", "content": "Work", "url": "javascript:alert(1)"}}).status_code == 400
    assert client.post(path + "/activity", headers=agent_headers, json=submission).status_code == 201
    assert client.patch("/api/tasks", json={"id": t["id"], "status": "DONE"}).status_code == 409
    assert client.patch("/api/tasks", json={"id": t["id"], "action": "request_changes"}).status_code == 400
    assert client.patch("/api/tasks", json={"id": t["id"], "action": "request_changes", "message": "Add evidence"}).json()["task"]["status"] == "doing"
    assert client.post(path + "/activity", headers=agent_headers, json=submission).status_code == 201
    approved = client.patch("/api/tasks", json={"id": t["id"], "action": "approve"}).json()["task"]
    assert approved["status"] == "done" and len(approved["deliverables"]) == 2
    assert approved["deliverables"][0]["feedback"] == "Add evidence"
    assert client.post(path + "/activity", headers=agent_headers, json=submission).status_code == 409


def test_project_context_subtasks_and_lead_permissions(logged_in, agent_headers):
    c = logged_in
    lead, writer, outsider = agent(c, "Lead"), agent(c, "Writer"), agent(c, "Outsider")
    p = c.post("/api/projects", json={"name": "Launch", "memberIds": [writer["id"]], "leadAgentId": lead["id"], "body": "Shared docs"}).json()["project"]
    parent = task(c, "Feature", projectId=p["id"])
    delegated = c.post(f"/api/agents/{lead['id']}/delegate", headers=agent_headers, json={"parentTaskId": parent["id"], "title": "Write", "assigneeId": writer["id"]})
    assert delegated.status_code == 201
    sub = delegated.json()["task"]
    ctx = c.get(f"/api/agents/{writer['id']}/tasks", headers=agent_headers).json()
    assert ctx["projects"][0]["body"] == "Shared docs" and len(ctx["projectTasks"]) == 2
    assert c.get(f"/api/agents/{outsider['id']}/tasks", headers=agent_headers).json()["projectTasks"] == []
    assert c.patch("/api/projects", json={"id": p["id"], "memberIds": []}).status_code == 409
    assert c.post(f"/api/agents/{writer['id']}/tasks", headers=agent_headers).json()["task"]["id"] == sub["id"]
    assert c.patch("/api/tasks", json={"id": parent["id"], "parentTaskId": sub["id"]}).status_code == 400
    report = {"taskId": sub["id"], "kind": "submitted", "message": "Review", "deliverable": {"title": "Draft", "content": "Text"}}
    assert c.post(f"/api/agents/{writer['id']}/activity", headers=agent_headers, json=report).status_code == 201
    assert c.post(f"/api/agents/{outsider['id']}/review", headers=agent_headers, json={"taskId": sub["id"], "action": "approve"}).status_code == 403
    assert c.post(f"/api/agents/{lead['id']}/review", headers=agent_headers, json={"taskId": sub["id"], "action": "approve"}).json()["task"]["status"] == "done"


def test_scoped_setup_rotation_messages_and_no_secret_leak(logged_in):
    c = logged_in
    a, b = agent(c, "A"), agent(c, "B")
    setup = c.post(f"/api/registry/{a['id']}/setup", json={})
    assert setup.status_code == 200 and setup.headers["cache-control"] == "no-store"
    files = setup.json()["files"]
    token = json.loads(files["watchtower-agent.json"])["apiKey"]
    scoped = {"Authorization": f"Bearer {token}"}
    assert "WATCHTOWER_TASK_COMMAND" in files["agent-runner.mjs"]
    assert c.get(f"/api/agents/{a['id']}/tasks", headers=scoped).status_code == 200
    assert c.get(f"/api/agents/{b['id']}/tasks", headers=scoped).status_code == 401
    assert c.get("/api/agents", headers=scoped).status_code == 401
    m = c.post("/api/messages", json={"agentId": a["id"], "text": "Standup?"}).json()["message"]
    assert "deliveredAt" not in m
    endpoint = f"/api/agents/{a['id']}/messages"
    assert c.post(endpoint, headers=scoped, json={"messageId": m["id"]}).status_code == 200
    reply = c.post(endpoint, headers=scoped, json={"messageId": m["id"], "reply": "Working"})
    assert reply.json()["message"]["reply"] == "Working"
    assert not c.get(endpoint, headers=scoped).json()["messages"]
    public = c.get("/api/state").text
    assert token not in public and "credentialHash" not in public
    assert c.post(f"/api/registry/{a['id']}/setup", json={}).status_code == 200
    assert c.get(endpoint, headers=scoped).status_code == 401
    assert c.post(f"/api/registry/{a['id']}/setup", json={"action": "revoke"}).status_code == 200


def test_templates_schedules_cron_and_month_end(logged_in):
    c = logged_in
    template = c.post("/api/automation", json={"action": "save_template", "name": "Daily", "blueprint": {"title": "Report", "body": "Brief", "priority": "normal", "subtasks": [{"title": "Collect"}]}})
    assert template.status_code == 200, template.text
    template_id = template.json()["result"]["id"]
    schedule = c.post("/api/automation", json={"action": "save_schedule", "name": "Daily", "templateId": template_id, "cadence": "daily", "nextRunAt": now_iso()})
    assert schedule.status_code == 200
    assert c.get("/api/cron").status_code == 401
    assert c.get("/api/cron", headers={"Authorization": "Bearer test-cron"}).json()["created"] == 1
    assert c.get("/api/cron", headers={"Authorization": "Bearer test-cron"}).json()["created"] == 0
    assert c.post("/api/automation", json={"action": "delete_template", "id": template_id}).status_code == 409
    assert len(c.get("/api/tasks").json()["tasks"]) == 2
    assert next_occurrence("2027-01-30T21:30:00.000Z", "monthly", 31) == "2027-02-27T21:30:00.000Z"
    assert next_occurrence("2027-02-27T21:30:00.000Z", "monthly", 31) == "2027-03-30T21:30:00.000Z"


def test_validation_rollback_logs_and_snapshot(logged_in):
    c = logged_in
    assert c.post("/api/tasks", json={"title": "Bad", "priority": "unknown"}).status_code == 422
    a = agent(c)
    assert c.patch("/api/registry", json={"id": a["id"], "heartbeatIntervalMinutes": 0}).status_code == 422
    assert c.post("/api/tasks", json={"title": "Wrong", "assigneeId": "missing"}).status_code == 404
    assert not c.get("/api/tasks").json()["tasks"]
    assert c.post("/api/logs", json={"date": "2026-02-31", "body": "No"}).status_code == 400
    assert c.post("/api/logs", json={"date": "2026-10-24", "body": "Update"}).status_code == 201
    assert c.get("/api/logs").json()["logs"][0]["date"] == "2026-10-24"
    vault = c.get("/api/vault").json()
    assert vault["source"]["kind"] == "snapshot" and vault["files"]
    integrations = c.get("/api/integrations").json()
    assert len(integrations["health"]) == 6
    assert all(not item["ok"] for key, item in integrations["data"].items() if key != "obsidian")


def test_concurrent_claims_and_transaction_rollback(tmp_path):
    repository = Repository(tmp_path / "race.sqlite3")
    repository.initialize()
    from backend.app.admin import save_agent
    from backend.app.domain import claim_next
    for name in ("A", "B"):
        repository.mutate(lambda s, n=name: save_agent(s, {"name": n}))
    repository.mutate(lambda s: create_task(s, {"title": "Exclusive"}))
    ids = [a["id"] for a in repository.read()["agents"]]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda a: repository.mutate(lambda s: claim_next(s, a)), ids))
    assert sum(r is not None for r in results) == 1
    assert len(repository.read()["tasks"][0]["assignmentHistory"]) == 1
    def fail(store):
        store["tasks"].clear()
        raise DomainError("fail")
    with pytest.raises(DomainError):
        repository.mutate(fail)
    assert len(repository.read()["tasks"]) == 1
    assert len(Repository(repository.path).read()["tasks"]) == 1


def test_import_preserves_ids_and_refuses_overwrite(tmp_path):
    repository = Repository(tmp_path / "import.sqlite3")
    repository.initialize()
    document = empty_state()
    document["agents"] = [{"id": "legacy-agent", "name": "Legacy"}]
    repository.import_state(document)
    assert repository.read()["agents"][0]["id"] == "legacy-agent"
    with pytest.raises(DomainError):
        repository.import_state(empty_state())
    bad = {**document, "agents": document["agents"] * 2}
    with pytest.raises(DomainError):
        repository.import_state(bad, replace=True)
    assert len(repository.read()["agents"]) == 1
