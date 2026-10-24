from copy import deepcopy
from datetime import timedelta
import pytest
from backend.app.admin import automation, save_agent, save_project
from backend.app.domain import DomainError, claim_next, create_task, date, lead_review, next_occurrence, now_iso, report, tick_schedules, update_task
from backend.app.monitoring import dashboard_state, health, metrics
from backend.app.seed import build_seed, empty_state


def team():
    state = empty_state()
    a = save_agent(state, {"name": "Research", "tags": ["research"]})
    b = save_agent(state, {"name": "Writer", "tags": ["write"]})
    lead = save_agent(state, {"name": "Lead"})
    project = save_project(state, {"name": "Launch", "memberIds": [a["id"], b["id"]], "leadAgentId": lead["id"]})
    return state, a, b, lead, project


def test_pickup_prefers_assigned_work_and_respects_capabilities():
    s, a, b, _, p = team()
    urgent = create_task(s, {"title": "Urgent research", "priority": "urgent", "requiredTags": ["research"], "projectId": p["id"]})
    assigned = create_task(s, {"title": "Assigned first", "priority": "low", "assigneeId": a["id"], "projectId": p["id"]})
    assert claim_next(s, a["id"])["id"] == assigned["id"]
    assert claim_next(s, a["id"])["id"] == assigned["id"]
    assert claim_next(s, b["id"]) is None
    assigned["status"] = "done"
    assert claim_next(s, a["id"])["id"] == urgent["id"]


def test_dependency_and_subtask_cycles_and_parent_completion_gates():
    s, a, b, _, p = team()
    parent = create_task(s, {"title": "Parent", "projectId": p["id"], "assigneeId": a["id"]})
    child = create_task(s, {"title": "Child", "parentTaskId": parent["id"], "assigneeId": b["id"]})
    assert claim_next(s, a["id"]) is None
    with pytest.raises(DomainError, match="parent"):
        update_task(deepcopy(s), {"id": child["id"], "dependsOn": [parent["id"]]})
    with pytest.raises(DomainError, match="cycles"):
        update_task(deepcopy(s), {"id": parent["id"], "parentTaskId": child["id"]})
    with pytest.raises(DomainError, match="subtasks"):
        report(s, a["id"], {"taskId": parent["id"], "kind": "submitted", "message": "Ready", "deliverable": {"title": "Bad", "content": "Not ready"}})
    child["status"] = "done"
    assert claim_next(s, a["id"])["id"] == parent["id"]


def test_leads_cannot_review_their_own_work():
    s, _, _, lead, p = team()
    task = create_task(s, {"title": "Lead work", "projectId": p["id"], "assigneeId": lead["id"]})
    report(s, lead["id"], {"taskId": task["id"], "kind": "submitted", "message": "Review", "deliverable": {"title": "Own work", "content": "Results"}})
    with pytest.raises(DomainError) as error:
        lead_review(s, lead["id"], {"taskId": task["id"], "action": "approve"})
    assert error.value.status == 403


def test_recurring_catchup_is_idempotent_and_failures_leave_no_partial_templates():
    s = empty_state()
    template = automation(s, {"action": "save_template", "name": "Daily", "blueprint": {"title": "Report", "priority": "normal", "subtasks": [{"title": "Collect"}]}})
    automation(s, {"action": "save_schedule", "name": "Daily", "templateId": template["id"], "cadence": "daily", "nextRunAt": "2026-10-22T08:00:00.000Z"})
    assert tick_schedules(s, "2026-10-24T08:00:00.000Z")["created"] == 3
    assert len(s["tasks"]) == 6
    assert tick_schedules(s, "2026-10-24T08:00:00.000Z")["created"] == 0
    template["blueprint"]["subtasks"][0]["title"] = ""
    before = len(s["tasks"])
    assert tick_schedules(s, "2026-10-25T08:00:00.000Z")["errors"]
    assert len(s["tasks"]) == before


def test_monitoring_health_grace_and_eat_trends():
    s = empty_state()
    now = "2026-10-24T22:00:00.000Z"
    agent = save_agent(s, {"name": "A", "heartbeatIntervalMinutes": 5})
    agent.update(lastHeartbeat="2026-10-24T21:49:59.000Z", lastActivity="2026-10-24T21:55:00.000Z")
    assert health(agent, [], now)["online"]
    agent["lastActivity"] = None
    assert not health(agent, [], now)["online"]
    s["tasks"] = [{"id": "done", "status": "done", "updatedAt": "2026-10-24T21:30:00.000Z"}]
    data = metrics(s, now)
    assert data["trend"][-1] == {"day": "2026-10-25", "count": 1}
    agent["credentialHash"] = "sensitive-hash"
    public = dashboard_state(s)
    assert "credentialHash" not in public["agents"][0] and public["agents"][0]["hasCredential"]
    assert "health" in public["agents"][0]


def test_snapshot_seed_keeps_existing_record_shapes():
    seed = build_seed()
    assert seed["version"] == 1
    assert seed["agents"] and all("tags" in a for a in seed["agents"])
    assert all("owners" in t and "body" in t for t in seed["tasks"])


def test_monitoring_buckets_offsets_and_approved_tasks_without_double_counting():
    s = empty_state()
    s['tasks'] = [
        {'id': 'approved', 'status': 'done', 'updatedAt': '2026-10-23T22:00:00Z'},
        {'id': 'legacy', 'status': 'done', 'updatedAt': '2026-10-23T20:00:00Z'},
    ]
    s['activities'] = [
        {'id': 'a', 'kind': 'approved', 'taskId': 'approved', 'at': '2026-10-24T01:00:00+03:00'},
        {'id': 'b', 'kind': 'progress', 'at': '2026-10-23T22:15:00Z'},
        {'id': 'c', 'kind': 'heartbeat', 'at': '2026-10-23T20:00:00Z'},
        {'id': 'old', 'kind': 'progress', 'at': '2026-01-01T00:00:00Z'},
    ]
    data = metrics(s, '2026-10-24T09:00:00Z')
    assert data['trend'][-1] == {'day': '2026-10-24', 'count': 1}
    assert data['trend'][-2] == {'day': '2026-10-23', 'count': 1}
    assert data['heatmap'][-1]['hours'][1] == 2
    assert data['heatmap'][-2]['hours'][23] == 1
    assert sum(sum(day['hours']) for day in data['heatmap']) == 3
