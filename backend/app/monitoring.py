from collections import Counter
from copy import deepcopy
from datetime import timedelta
import re
from .domain import DomainError, EAT, date, iso, now_iso


def health(agent, tasks, now=None):
    now = date(now or now_iso())
    signals = []
    for key in ("lastHeartbeat", "lastActivity"):
        if agent.get(key):
            try:
                signals.append(date(agent[key]))
            except DomainError:
                pass
    seen = max(signals) if signals else None
    online = seen is not None and (now - seen).total_seconds() <= (agent.get("heartbeatIntervalMinutes") or 15) * 120
    assigned = [t for t in tasks if t.get("assigneeId") == agent["id"]]
    active = [t for t in assigned if t["status"] == "doing"]
    blocked = [t for t in assigned if t["status"] == "blocked"]
    state = "offline" if not online else "blocked" if blocked or re.search("blocked|error", agent.get("status", ""), re.I) else "working" if active or "working" in agent.get("status", "").lower() else "idle"
    return {"lastSeenAt": iso(seen) if seen else None, "online": online, "assigned": assigned, "active": active, "blocked": blocked, "state": state}


def metrics(store, now=None):
    now = date(now or now_iso())
    days = [(now - timedelta(days=13-i)).astimezone(EAT).date().isoformat() for i in range(14)]
    approvals = [a for a in store["activities"] if a["kind"] == "approved"]
    approved_ids = {a.get("taskId") for a in approvals}
    times = [a["at"] for a in approvals] + [t.get("lastStatusChangeAt", t["updatedAt"]) for t in store["tasks"] if t["status"] == "done" and t["id"] not in approved_ids]
    # Parse each timestamp once instead of rescanning every event for 168 cells.
    completed_by_day = Counter(date(at).astimezone(EAT).date().isoformat() for at in times)
    activity_by_hour = Counter()
    for activity in store["activities"]:
        local = date(activity["at"]).astimezone(EAT)
        activity_by_hour[(local.date().isoformat(), local.hour)] += 1
    trend = [{"day": day, "count": completed_by_day[day]} for day in days]
    heatmap = [{"day": day, "hours": [activity_by_hour[(day, hour)] for hour in range(24)]} for day in days[7:]]
    return {"trend": trend, "heatmap": heatmap, "currentWeek": sum(d["count"] for d in trend[7:]), "previousWeek": sum(d["count"] for d in trend[:7]), "workload": [{"agent": a, **health(a, store["tasks"], iso(now))} for a in store["agents"]]}


def public_agent(agent):
    return {**{k: v for k, v in agent.items() if k != "credentialHash"}, "hasCredential": bool(agent.get("credentialHash"))}


def dashboard_state(store):
    state = deepcopy(store)
    state["agents"] = [public_agent(a) for a in state["agents"]]
    for agent in state["agents"]:
        agent["health"] = health(agent, state["tasks"])
    # Metrics get plain public agents, avoiding recursive health structures.
    metric_store = {**state, "agents": [{k: v for k, v in a.items() if k != "health"} for a in state["agents"]]}
    state["monitoring"] = metrics(metric_store)
    return state
