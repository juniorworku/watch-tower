"""Administrative services; all mutations run inside repository transactions."""
from copy import deepcopy
from .domain import (DomainError, EAT, create_task, date, event, find, instantiate,
                     iso, now_iso, project_for, tags, tick_schedules, uid, validate_links)
from .schemas import Blueprint


def save_agent(store, body, agent_id=None, upsert=False):
    now = now_iso()
    existing = find(store, "agents", agent_id, False) if agent_id else None
    if agent_id and not existing and not upsert:
        raise DomainError("agent not found", 404)
    name = str(body.get("name", existing.get("name", "") if existing else "")).strip()
    if not name:
        raise DomainError("name required")
    agent = deepcopy(existing) if existing else {"id": agent_id or uid("agent"), "name": name, "platform": "custom", "type": "agent", "parentId": None, "role": "", "owner": "", "status": "active", "url": "", "webhook": "", "tags": [], "createdAt": now, "lastHeartbeat": None, "lastActivity": None, "lastActivityText": None, "heartbeatIntervalMinutes": 15, "personality": "", "instructions": ""}
    for key in ("name", "platform", "type", "parentId", "role", "owner", "status", "url", "webhook", "personality", "instructions", "heartbeatIntervalMinutes"):
        if key in body:
            agent[key] = body[key]
    agent["name"] = name
    agent["parentId"] = agent.get("parentId") or None
    if "endpoint" in body and "webhook" not in body:
        agent["webhook"] = body["endpoint"]
    if "tags" in body:
        agent["tags"] = tags(body["tags"])
    if agent["type"] not in ("bot", "agent", "sub-agent"):
        raise DomainError("invalid agent type")
    if agent["type"] == "sub-agent" and not agent["parentId"]:
        raise DomainError("parentId required for sub-agent")
    seen = {agent["id"]}
    parent_id = agent["parentId"]
    while parent_id:
        if parent_id in seen:
            raise DomainError("agent hierarchy cannot contain cycles")
        seen.add(parent_id)
        parent_id = find(store, "agents", parent_id).get("parentId")
    agent["updatedAt"] = now
    if existing:
        existing.clear()
        existing.update(agent)
    else:
        store["agents"].append(agent)
    for task in store["tasks"]:
        if task.get("assigneeId") == agent["id"]:
            task["assigneeName"] = name
    return agent


def delete_agent(store, agent_id):
    find(store, "agents", agent_id)
    if any(t.get("assigneeId") == agent_id for t in store["tasks"]) or any(p.get("leadAgentId") == agent_id or agent_id in p.get("memberIds", []) for p in store["projects"]):
        raise DomainError("Unassign tasks and remove this agent from project teams before removing it", 409)
    store["agents"] = [a for a in store["agents"] if a["id"] != agent_id]
    for agent in store["agents"]:
        if agent.get("parentId") == agent_id:
            agent["parentId"] = None
    return {"ok": True}


def save_project(store, body, project_id=None):
    existing = find(store, "projects", project_id) if project_id else None
    name = str(body.get("name", existing["name"] if existing else "")).strip()
    if not name:
        raise DomainError("project name required")
    if any(p["id"] != project_id and p["name"].lower() == name.lower() for p in store["projects"]):
        raise DomainError("project name already exists", 409)
    members = list(dict.fromkeys(body.get("memberIds", existing.get("memberIds", []) if existing else [])))
    lead = body.get("leadAgentId", existing.get("leadAgentId") if existing else None) or None
    if lead and lead not in members:
        members.append(lead)
    for agent_id in members:
        find(store, "agents", agent_id)
    linked = [t for t in store["tasks"] if (project_for(store, t) or {}).get("id") == project_id] if existing else []
    if any(t.get("assigneeId") and t["status"] != "done" and t["assigneeId"] not in members for t in linked):
        raise DomainError("reassign open tasks before removing their agents from this project", 409)
    now = now_iso()
    project = existing or {"id": uid("proj"), "owner": "", "status": "active", "archived": False, "started": now[:10], "body": "", "createdAt": now}
    project.update(name=name, memberIds=members, leadAgentId=lead, updatedAt=now)
    for key in ("body", "owner", "status", "started", "archived"):
        if key in body:
            project[key] = body[key]
    if not existing:
        store["projects"].insert(0, project)
    for task in linked:
        task.update(projectId=project["id"], project=name)
    return project


def automation(store, body):
    now = now_iso()
    action = body.get("action")
    if action == "tick":
        return tick_schedules(store, now)
    if action == "save_template":
        name = str(body.get("name") or "").strip()
        if not name:
            raise DomainError("template name required")
        if body.get("taskId"):
            task = find(store, "tasks", body["taskId"])
            blueprint = {"title": task["title"], "body": task["body"], "priority": task.get("priority", "normal"), "projectId": (project_for(store, task) or {}).get("id"), "assigneeId": task.get("assigneeId"), "requiredTags": task.get("requiredTags", []), "subtasks": [{k: t.get(k) for k in ("title", "body", "assigneeId", "requiredTags") if t.get(k) is not None} for t in store["tasks"] if t.get("parentTaskId") == task["id"]]}
        else:
            blueprint = body.get("blueprint")
        blueprint = Blueprint.model_validate(blueprint).model_dump()
        instantiate(deepcopy(store), blueprint, now, "Template validation")
        existing = find(store, "templates", body["id"]) if body.get("id") else None
        template = existing or {"id": uid("template"), "createdAt": now}
        template.update(name=name, blueprint=blueprint, updatedAt=now)
        if not existing:
            store["templates"].append(template)
        return template
    if action == "instantiate":
        template = find(store, "templates", body.get("templateId"))
        blueprint = deepcopy(template["blueprint"])
        if body.get("title"):
            blueprint["title"] = str(body["title"])
        return instantiate(store, blueprint, now, f"Template: {template['name']}")
    if action == "delete_template":
        if any(s["templateId"] == body.get("id") for s in store["schedules"]):
            raise DomainError("remove this template's schedules first", 409)
        store["templates"] = [t for t in store["templates"] if t["id"] != body.get("id")]
        return {"ok": True}
    if action == "save_schedule":
        find(store, "templates", body.get("templateId"))
        if body.get("cadence") not in ("daily", "weekly", "monthly") or not str(body.get("name") or "").strip():
            raise DomainError("name and valid cadence required")
        next_run = date(body.get("nextRunAt"))
        existing = find(store, "schedules", body["id"]) if body.get("id") else None
        schedule = existing or {"id": uid("schedule"), "createdAt": now}
        schedule.update(name=str(body["name"]).strip(), templateId=body["templateId"], cadence=body["cadence"], nextRunAt=iso(next_run), anchorDay=next_run.astimezone(EAT).day, enabled=body.get("enabled", True))
        if not existing:
            store["schedules"].append(schedule)
        return schedule
    if action == "toggle_schedule":
        schedule = find(store, "schedules", body.get("id"))
        schedule["enabled"] = not schedule["enabled"]
        return schedule
    if action == "delete_schedule":
        store["schedules"] = [s for s in store["schedules"] if s["id"] != body.get("id")]
        return {"ok": True}
    raise DomainError("invalid automation action")


def delegate(store, agent_id, body):
    parent = find(store, "tasks", body.get("parentTaskId"))
    project = project_for(store, parent)
    if not project or project.get("archived") or project.get("leadAgentId") != agent_id:
        raise DomainError("only the project lead can delegate", 403)
    return create_task(store, {**body, "parentTaskId": parent["id"], "priority": parent.get("priority", "normal")}, source="Lead delegation")


def send_message(store, body):
    find(store, "agents", body["agentId"])
    text = body["text"].strip()
    if not text or len(text) > 20000:
        raise DomainError("message must contain 1–20000 characters")
    message = {"id": uid("message"), "agentId": body["agentId"], "text": text, "createdAt": now_iso()}
    store["messages"].append(message)
    from .channels import queue_text
    queued = queue_text(store, body["agentId"], f"{text}\n\nReply with /reply {message['id']} your response", message_id=message["id"])
    if queued:
        message.update(provider=queued[0]["provider"], deliveryStatus="queued", direction="outbound")
    return message


def answer_message(store, agent_id, body):
    agent = find(store, "agents", agent_id)
    message = find(store, "messages", body.get("messageId"))
    if message["agentId"] != agent_id or message.get("direction") == "inbound":
        raise DomainError("message not found", 404)
    now = now_iso()
    message.setdefault("deliveredAt", now)
    if "reply" in body:
        reply = str(body.get("reply") or "").strip()
        if message.get("repliedAt"):
            raise DomainError("message already answered", 409)
        if not reply or len(reply) > 20000:
            raise DomainError("reply must contain 1–20000 characters")
        message.update(reply=reply, repliedAt=now)
        event(store, agent_id, "message", reply, at=now)
    agent.update(lastActivity=now, lastActivityText=str(body.get("reply") or "Message received")[:280], updatedAt=now)
    return message
