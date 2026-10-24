from datetime import datetime
import hashlib
import json
from pathlib import Path
import secrets
from time import perf_counter
from fastapi import APIRouter, BackgroundTasks, Body, Depends, Request, Response
from fastapi.responses import JSONResponse
from ..auth import dashboard
from .. import admin
from ..domain import DomainError, create_task, find, now_iso, uid, update_task
from ..monitoring import dashboard_state, public_agent
from ..schemas import AgentPayload, MessageInput, ProjectInput, TaskCreate, TaskPatch

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(dashboard)])

def repo(request):
    return request.app.state.repository


def queue_delivery(request, background_tasks, agent_id):
    from ..channels import deliver_after_write
    if agent_id:
        background_tasks.add_task(deliver_after_write, repo(request), request.app.state.settings, agent_id)

@router.get("/state")
def state(request: Request, response: Response):
    started = perf_counter()
    document = repo(request).read()
    read_at = perf_counter()
    result = dashboard_state(document)
    response.headers["Server-Timing"] = f"db;dur={(read_at-started)*1000:.1f}, projection;dur={(perf_counter()-read_at)*1000:.1f}"
    return result

@router.get("/tasks")
def tasks(request: Request):
    return {"tasks": repo(request).read()["tasks"]}

@router.post("/tasks", status_code=201)
def add_task(request: Request, body: TaskCreate, background_tasks: BackgroundTasks):
    task = repo(request).mutate(lambda s: create_task(s, body.model_dump(exclude_unset=True)))
    queue_delivery(request, background_tasks, task.get("assigneeId"))
    return {"task": task}

@router.patch("/tasks")
def edit_task(request: Request, body: TaskPatch, background_tasks: BackgroundTasks):
    task = repo(request).mutate(lambda s: update_task(s, body.model_dump(exclude_unset=True)))
    queue_delivery(request, background_tasks, task.get("assigneeId"))
    return {"task": task}

@router.get("/registry")
def agents(request: Request):
    return {"agents": [public_agent(a) for a in repo(request).read()["agents"]]}

@router.post("/registry", status_code=201)
def create_agent(request: Request, body: AgentPayload):
    return {"agent": public_agent(repo(request).mutate(lambda s: admin.save_agent(s, body.model_dump(exclude_unset=True))))}

@router.patch("/registry")
def edit_agent(request: Request, body: AgentPayload):
    data = body.model_dump(exclude_unset=True)
    if not data.get("id"):
        raise DomainError("id required")
    return {"agent": public_agent(repo(request).mutate(lambda s: admin.save_agent(s, data, data["id"])))}

@router.delete("/registry")
def remove_agent(request: Request, body: dict = Body(default={})):
    return repo(request).mutate(lambda s: admin.delete_agent(s, body.get("id")))

@router.get("/projects")
def projects(request: Request):
    return {"projects": repo(request).read()["projects"]}

@router.post("/projects", status_code=201)
def create_project(request: Request, body: ProjectInput):
    return {"project": repo(request).mutate(lambda s: admin.save_project(s, body.model_dump(exclude_unset=True)))}

@router.patch("/projects")
def edit_project(request: Request, body: ProjectInput):
    body = body.model_dump(exclude_unset=True)
    if not body.get("id"):
        raise DomainError("id required")
    return {"project": repo(request).mutate(lambda s: admin.save_project(s, body, body["id"]))}

@router.get("/automation")
def automation_state(request: Request):
    value = repo(request).read()
    return {"templates": value["templates"], "schedules": value["schedules"]}

@router.post("/automation")
def automate(request: Request, body: dict = Body(...)):
    return {"result": repo(request).mutate(lambda s: admin.automation(s, body))}

@router.post("/messages", status_code=201)
def send_message(request: Request, body: MessageInput, background_tasks: BackgroundTasks):
    message = repo(request).mutate(lambda s: admin.send_message(s, body.model_dump()))
    if message.get("provider"):
        queue_delivery(request, background_tasks, body.agentId)
    return {"message": message}

@router.get("/logs")
def logs(request: Request):
    return {"logs": repo(request).read()["logs"]}

@router.post("/logs", status_code=201)
def add_log(request: Request, body: dict = Body(...)):
    day = str(body.get("date") or now_iso()[:10])
    try:
        if datetime.strptime(day, "%Y-%m-%d").strftime("%Y-%m-%d") != day:
            raise ValueError()
    except ValueError:
        raise DomainError("date must be YYYY-MM-DD")
    text = str(body.get("body") or body.get("text") or "").strip()
    if not text:
        raise DomainError("body required")
    def append(store):
        now = now_iso()
        entry = next((l for l in store["logs"] if l["date"] == day), None)
        section = f"\n\n### {body['agent']}\n- {text}" if body.get("agent") else f"\n\n- {text}"
        if entry:
            entry.update(body=entry["body"].rstrip() + section, updatedAt=now)
        else:
            entry = {"id": uid("log"), "date": day, "body": f"# {day}\n\n## Summary\n{text}" + (section if body.get("agent") else ""), "createdAt": now, "updatedAt": now}
            store["logs"].insert(0, entry)
        return entry
    return {"log": repo(request).mutate(append)}

@router.post("/registry/{agent_id}/setup")
def setup(request: Request, agent_id: str, body: dict = Body(default={})):
    if body.get("action") == "revoke":
        def revoke(store):
            agent = find(store, "agents", agent_id)
            agent.pop("credentialHash", None)
            agent.pop("credentialCreatedAt", None)
        repo(request).mutate(revoke)
        return {"revoked": True}
    runner = (Path(__file__).resolve().parents[2] / "runtime/agent-runner.mjs").read_text()
    credential = "wt_" + secrets.token_urlsafe(32)
    def generate(store):
        agent = find(store, "agents", agent_id)
        agent.update(credentialHash=hashlib.sha256(credential.encode()).hexdigest(), credentialCreatedAt=now_iso())
        return agent
    agent = repo(request).mutate(generate)
    base = request.app.state.settings.public_url
    config = {"baseUrl": base, "agentId": agent_id, "apiKey": credential, "heartbeatIntervalMinutes": agent.get("heartbeatIntervalMinutes") or 15}
    files = {
        "watchtower-agent.json": json.dumps(config, indent=2),
        "agent-runner.mjs": runner,
        "HEARTBEAT.md": f'# {agent["name"]}: heartbeat\nEvery {config["heartbeatIntervalMinutes"]} minutes POST {base}/api/agents/{agent_id}/activity with Authorization: Bearer {credential} and JSON {{"kind":"heartbeat","message":"Checking in","pickup":true}}.\nGET /api/agents/{agent_id}/tasks for instructions, project docs, shared work and feedback. POST the same URL to claim work atomically. GET /api/agents/{agent_id}/messages for unanswered messages and POST {{"messageId":"..."}} to acknowledge or {{"messageId":"...","reply":"..."}} to reply.\n',
        "PLAYBOOK.md": f'# {agent["name"]}\nRole: {agent.get("role", "")}\nPersonality: {agent.get("personality") or "Professional and clear"}\n\n{agent.get("instructions") or "Follow project docs and task requirements."}\n\nWork one task at a time and respect dependencies. Submit {{taskId,kind:"submitted",message,deliverable:{{title,content,url?}}}} to /api/agents/{agent_id}/activity. Wait for review, then revise if requested. Leads can POST {{taskId,action:"approve"|"request_changes",message}} to /api/agents/{agent_id}/review and create subtasks at /delegate. Never approve your own deliverable.\n',
    }
    return JSONResponse({"files": files}, headers={"Cache-Control": "no-store"})
