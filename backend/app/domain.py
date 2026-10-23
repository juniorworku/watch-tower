"""Pure workforce rules, shared by dashboard and machine endpoints."""
from calendar import monthrange
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlparse
from uuid import uuid4

EAT = timezone(timedelta(hours=3))
STATUSES = {"todo", "assigned", "doing", "blocked", "review", "done"}
PRIORITIES = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
COLLECTIONS = ("tasks", "projects", "agents", "activities", "logs", "templates", "schedules", "messages")

class DomainError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def uid(prefix):
    return f"{prefix}-{uuid4()}"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def date(iso):
    try:
        value = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    except (ValueError, TypeError):
        raise DomainError("valid ISO date/time required")


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def tags(value):
    return list(dict.fromkeys(str(t).strip() for t in (value if isinstance(value, list) else str(value or "").split(",")) if str(t).strip()))


def find(store, collection, item_id, required=True):
    item = next((i for i in store[collection] if i["id"] == item_id), None)
    if required and item is None:
        raise DomainError(f"{collection.rstrip('s')} not found", 404)
    return item


def project_for(store, task):
    if task.get("projectId"):
        return find(store, "projects", task["projectId"], False)
    return next((p for p in store["projects"] if p["name"].lower() == task.get("project", "").lower()), None)


def member(project, agent_id):
    return project.get("leadAgentId") == agent_id or agent_id in project.get("memberIds", [])


def event(store, agent_id, kind, message, task_id=None, actor="agent", at=None, meta=None):
    value = {"id": uid("act"), "agentId": agent_id, "kind": kind, "message": message, "actor": actor, "at": at or now_iso()}
    if task_id:
        value["taskId"] = task_id
    if meta is not None:
        value["meta"] = meta
    store["activities"].insert(0, value)
    return value


def set_status(task, status, now):
    if task.get("status") != status:
        task["lastStatusChangeAt"] = now
    task.update(status=status, updatedAt=now)


def assign(store, task, agent_id, now, reason="Dashboard assignment", actor="operator"):
    agent = find(store, "agents", agent_id) if agent_id else None
    previous = task.get("assigneeId")
    if previous == agent_id:
        return
    task.update(assigneeId=agent_id, assigneeName=agent["name"] if agent else None, currentRunId=None, claimedAt=None)
    task.setdefault("assignmentHistory", []).append({"fromId": previous, "toId": agent_id, "at": now, "reason": reason})
    set_status(task, "assigned" if agent else "todo", now)
    event(store, agent_id or previous, "re-assigned" if previous else "assigned", f"{reason}: {agent['name'] if agent else 'unassigned'}", task["id"], actor, now)


def ready(store, task):
    return all((find(store, "tasks", i, False) or {}).get("status") == "done" for i in task.get("dependsOn", []))


def children_done(store, task):
    if any(t.get("parentTaskId") == task["id"] and t["status"] != "done" for t in store["tasks"]):
        raise DomainError("Complete all subtasks before submitting or approving the parent", 409)


def validate_links(store, task):
    project = project_for(store, task)
    if task.get("projectId") and (not project or project.get("archived")):
        raise DomainError("active project not found")
    if task.get("assigneeId"):
        find(store, "agents", task["assigneeId"])
        if project and not member(project, task["assigneeId"]):
            raise DomainError("assignee must be a project member")
    project_id = project.get("id") if project else None
    for child in store["tasks"]:
        if child.get("parentTaskId") == task["id"] and (project_for(store, child) or {}).get("id") != project_id:
            raise DomainError("parent and subtasks must stay in the same project")
    ancestors = set()
    parent_id = task.get("parentTaskId")
    while parent_id:
        if parent_id == task["id"] or parent_id in ancestors:
            raise DomainError("task hierarchy cannot contain cycles")
        ancestors.add(parent_id)
        parent = find(store, "tasks", parent_id)
        if parent_id == task.get("parentTaskId"):
            if parent["status"] in ("done", "review"):
                raise DomainError("reopen parent before adding or changing subtasks", 409)
            if (project_for(store, parent) or {}).get("id") != project_id:
                raise DomainError("subtasks must use the parent's project")
        parent_id = parent.get("parentTaskId")
    def visit(dependency_id, seen):
        if dependency_id in ancestors:
            raise DomainError("a subtask cannot depend on its parent")
        if dependency_id == task["id"] or dependency_id in seen:
            raise DomainError("task dependencies cannot contain cycles")
        dependency = find(store, "tasks", dependency_id)
        if (project_for(store, dependency) or {}).get("id") != project_id:
            raise DomainError("dependencies must use the same project")
        for next_id in dependency.get("dependsOn", []):
            visit(next_id, seen | {dependency_id})
    for dependency_id in task.get("dependsOn", []):
        visit(dependency_id, set())


def create_task(store, body, now=None, task_id=None, source="dashboard"):
    now = now or now_iso()
    title = str(body.get("title") or "").strip()
    if not title:
        raise DomainError("title required")
    priority = body.get("priority", "normal")
    if priority not in PRIORITIES:
        raise DomainError("invalid priority")
    task = {"id": task_id or uid("task"), "title": title, "body": str(body.get("body") or ""), "status": "todo", "projectId": body.get("projectId") or None,
            "project": str(body.get("project") or ""), "parentTaskId": body.get("parentTaskId") or None, "dependsOn": body.get("dependsOn") or [],
            "requiredTags": tags(body.get("requiredTags")), "priority": priority, "owners": tags(body.get("owners", re.split(r"[,/]", str(body.get("owner") or "")))),
            "due": str(body.get("due") or ""), "source": source, "createdAt": now, "updatedAt": now, "lastStatusChangeAt": now, "assignmentHistory": [], "assigneeId": None}
    if task["parentTaskId"]:
        parent = find(store, "tasks", task["parentTaskId"])
        task.update(projectId=(project_for(store, parent) or {}).get("id"), project=parent.get("project", ""))
    elif task["projectId"]:
        task["project"] = find(store, "projects", task["projectId"])["name"]
    if body.get("assigneeId"):
        assign(store, task, str(body["assigneeId"]), now, source if source != "dashboard" else "Dashboard assignment")
    validate_links(store, task)
    store["tasks"].insert(0, task)
    return task


def review(store, task, action, feedback, reviewer="operator", now=None):
    now = now or now_iso()
    latest = (task.get("deliverables") or [None])[-1]
    if task["status"] != "review" or not latest or latest["review"] != "pending":
        raise DomainError("no pending deliverable to review", 409)
    if action == "request_changes" and not feedback.strip():
        raise DomainError("feedback required when requesting changes")
    if action == "approve":
        children_done(store, task)
    latest.update(review="approved" if action == "approve" else "changes_requested", feedback=feedback.strip(), reviewedAt=now, reviewedBy=reviewer)
    set_status(task, "done" if action == "approve" else "doing", now)
    event(store, task.get("assigneeId") or "operator" if reviewer == "operator" else reviewer, "approved" if action == "approve" else "changes_requested", feedback or "Deliverable approved", task["id"], "operator" if reviewer == "operator" else "agent", now)


def update_task(store, body):
    task = find(store, "tasks", body.get("id"))
    now = now_iso()
    action = body.get("action")
    if action:
        if action not in ("approve", "request_changes", "comment"):
            raise DomainError("invalid action")
        message = str(body.get("message") or "").strip()
        if action == "comment":
            if not message:
                raise DomainError("comment required")
            event(store, task.get("assigneeId") or "operator", "comment", message, task["id"], "operator", now)
        else:
            review(store, task, action, message, now=now)
        task["updatedAt"] = now
        return task
    status = str(body.get("status", task["status"])).lower()
    if status not in STATUSES:
        raise DomainError("invalid status")
    if status in ("done", "review") and status != task["status"]:
        raise DomainError("Submit a deliverable and approve it to complete work", 409)
    if task["status"] == "review" and (status != "review" or "assigneeId" in body):
        raise DomainError("Review pending deliverable before changing this task", 409)
    if "assigneeId" in body:
        assign(store, task, body["assigneeId"] or None, now)
        if "status" not in body:
            status = task["status"]
    if status == "assigned" and not task.get("assigneeId"):
        raise DomainError("assign an agent first", 409)
    if status == "doing":
        if not ready(store, task):
            raise DomainError("task dependencies are not complete", 409)
        if task.get("assigneeId") and any(t["id"] != task["id"] and t.get("assigneeId") == task["assigneeId"] and t["status"] in ("doing", "blocked") for t in store["tasks"]):
            raise DomainError("agent already has active work", 409)
    if status != task["status"]:
        set_status(task, status, now)
        event(store, task.get("assigneeId") or "operator", "status", f"Dashboard changed status to {status}", task["id"], "operator", now)
    for key in ("title", "body", "due", "project", "parentTaskId", "dependsOn", "priority"):
        if key in body:
            task[key] = body[key]
    if not task["title"].strip() or task.get("priority", "normal") not in PRIORITIES:
        raise DomainError("valid title and priority required")
    for key in ("owners", "requiredTags"):
        if key in body:
            task[key] = tags(body[key])
    if "projectId" in body:
        task["projectId"] = body["projectId"] or None
        task["project"] = find(store, "projects", body["projectId"])["name"] if body["projectId"] else ""
    elif "project" in body:
        task["projectId"] = (project_for(store, {"project": body["project"]}) or {}).get("id")
    validate_links(store, task)
    task["updatedAt"] = now
    return task


def claim_next(store, agent_id, now=None):
    now = now or now_iso()
    agent = find(store, "agents", agent_id)
    if re.search("paused|disabled", agent.get("status", ""), re.I):
        return None
    occupied = next((t for t in store["tasks"] if t.get("assigneeId") == agent_id and t["status"] in ("doing", "blocked")), None)
    if occupied:
        return occupied
    candidates = []
    for task in store["tasks"]:
        project = project_for(store, task)
        if (task.get("projectId") and not project) or (project and project.get("archived")) or not ready(store, task):
            continue
        if any(t.get("parentTaskId") == task["id"] and t["status"] != "done" for t in store["tasks"]):
            continue
        assigned = task.get("assigneeId") == agent_id and task["status"] in ("todo", "assigned")
        eligible = not task.get("assigneeId") and task["status"] == "todo" and (not project or member(project, agent_id)) and set(task.get("requiredTags", [])).issubset(set(agent.get("tags", [])))
        if assigned or eligible:
            candidates.append(task)
    candidates.sort(key=lambda t: (t.get("assigneeId") != agent_id, PRIORITIES.get(t.get("priority"), 2), t["createdAt"], t["id"]))
    if not candidates:
        return None
    task = candidates[0]
    assign(store, task, agent_id, now, "Automatic task pickup", "agent")
    set_status(task, "doing", now)
    task["claimedAt"] = now
    event(store, agent_id, "claimed", f"Picked up {task['title']}", task["id"], at=now)
    return task


def report(store, agent_id, body):
    agent = find(store, "agents", agent_id)
    kind = body.get("kind", "activity")
    allowed = {"heartbeat", "activity", "status", "accepted", "started", "progress", "blocked", "completed", "failed", "rejected", "submitted"}
    if kind not in allowed:
        raise DomainError("invalid event kind")
    task_id = body.get("taskId")
    if kind not in ("heartbeat", "activity", "status") and not task_id:
        raise DomainError("taskId required")
    message = str(body.get("message") or body.get("text") or ("heartbeat" if kind == "heartbeat" else "")).strip()
    if not message:
        raise DomainError("message required")
    now = now_iso()
    task = find(store, "tasks", task_id) if task_id else None
    if task:
        if task.get("assigneeId") != agent_id:
            raise DomainError("task is not assigned to this agent", 409)
        if task["status"] in ("done", "review") and kind not in ("heartbeat", "activity", "status"):
            raise DomainError("task is completed or awaiting review", 409)
        if kind in ("accepted", "started", "submitted", "completed") and not ready(store, task):
            raise DomainError("task dependencies are not complete", 409)
        if kind == "started" and any(t["id"] != task_id and t.get("assigneeId") == agent_id and t["status"] in ("doing", "blocked") for t in store["tasks"]):
            raise DomainError("agent already has active work", 409)
        if kind in ("submitted", "completed"):
            children_done(store, task)
            deliverable = body.get("deliverable") or {}
            title, content, url = (str(deliverable.get(k) or "").strip() for k in ("title", "content", "url"))
            if not title or not content:
                raise DomainError("deliverable title and content required")
            if url and (urlparse(url).scheme not in ("http", "https") or not urlparse(url).netloc):
                raise DomainError("deliverable URL must use http or https")
            task.setdefault("deliverables", []).append({"id": uid("output"), "agentId": agent_id, "title": title, "content": content, "url": url or None, "submittedAt": now, "review": "pending"})
            set_status(task, "review", now)
        elif kind == "rejected":
            assign(store, task, None, now, message, "agent")
        elif kind in {"accepted", "started", "blocked", "failed"}:
            set_status(task, {"accepted": "assigned", "started": "doing", "blocked": "blocked", "failed": "blocked"}[kind], now)
        if body.get("currentRunId") and kind != "rejected":
            task["currentRunId"] = body["currentRunId"]
        task["updatedAt"] = now
    reported = body.get("status") or ("blocked" if any(t.get("assigneeId") == agent_id and t["status"] == "blocked" for t in store["tasks"]) else "working" if any(t.get("assigneeId") == agent_id and t["status"] == "doing" for t in store["tasks"]) else "idle")
    activity = event(store, agent_id, "submitted" if kind == "completed" else kind, message, task_id, at=now, meta={**(body.get("meta") or {}), "reportedStatus": reported, "taskStatus": task.get("status") if task else None})
    agent.update(lastActivity=now, lastActivityText=message[:280], updatedAt=now)
    if kind == "heartbeat":
        agent["lastHeartbeat"] = now
        tick_schedules(store, now)
        if body.get("pickup") is True:
            claim_next(store, agent_id, now)
    if body.get("status"):
        agent["status"] = body["status"]
    return activity


def lead_review(store, agent_id, body):
    task = find(store, "tasks", body.get("taskId"))
    project = project_for(store, task)
    if not project or project.get("archived") or project.get("leadAgentId") != agent_id or task.get("assigneeId") == agent_id:
        raise DomainError("Only this project's lead can review another member's work", 403)
    action = body.get("action")
    if action not in ("approve", "request_changes"):
        raise DomainError("invalid review action")
    review(store, task, action, str(body.get("message") or ""), agent_id)
    return task


def instantiate(store, blueprint, now=None, source="Template", task_id=None):
    now = now or now_iso()
    parent = create_task(store, blueprint, now, task_id, source)
    for index, sub in enumerate(blueprint.get("subtasks", [])):
        create_task(store, {**sub, "parentTaskId": parent["id"], "priority": blueprint.get("priority", "normal")}, now, f"{parent['id']}-sub-{index}", source)
    return parent


def next_occurrence(at, cadence, anchor_day):
    value = date(at).astimezone(EAT)
    if cadence == "monthly":
        year, month = (value.year + 1, 1) if value.month == 12 else (value.year, value.month + 1)
        value = value.replace(year=year, month=month, day=min(anchor_day, monthrange(year, month)[1]))
    else:
        value += timedelta(days=7 if cadence == "weekly" else 1)
    return iso(value)


def tick_schedules(store, now=None):
    now = now or now_iso()
    created, errors = 0, []
    for schedule in store["schedules"]:
        if not schedule.get("enabled"):
            continue
        template = find(store, "templates", schedule["templateId"], False)
        if not template:
            schedule["lastError"] = "Template missing"
            errors.append(f"{schedule['name']}: Template missing")
            continue
        for _ in range(30):
            if date(schedule["nextRunAt"]) > date(now):
                break
            at = schedule["nextRunAt"]
            task_id = f"recurring-{schedule['id']}-{int(date(at).timestamp() * 1000)}"
            try:
                if not find(store, "tasks", task_id, False):
                    draft = deepcopy(store)
                    task = instantiate(draft, template["blueprint"], now, f"Schedule: {schedule['name']}", task_id)
                    task.update(scheduleId=schedule["id"], scheduledFor=at)
                    store["tasks"], store["activities"] = draft["tasks"], draft["activities"]
                    created += 1
            except DomainError as error:
                schedule["lastError"] = str(error)
                errors.append(f"{schedule['name']}: {error}")
                break
            schedule.pop("lastError", None)
            schedule["lastRunAt"] = at
            schedule["nextRunAt"] = next_occurrence(at, schedule["cadence"], schedule["anchorDay"])
    return {"created": created, "errors": errors}
