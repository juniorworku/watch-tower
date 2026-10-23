from fastapi import APIRouter, Body, Depends, Request
from .. import admin, auth
from ..domain import claim_next, find, lead_review, member, project_for, report, tick_schedules
from ..monitoring import public_agent
from ..schemas import ActivityInput, AgentPayload

router = APIRouter(prefix="/api/agents", tags=["agents"])

@router.get("", dependencies=[Depends(auth.master)])
def registry(request: Request):
    state = request.app.state.repository.read()
    return {"agents": [public_agent(a) for a in state["agents"]], "activities": state["activities"][:50]}

@router.post("", status_code=201, dependencies=[Depends(auth.master)])
def register(request: Request, body: AgentPayload):
    data = body.model_dump(exclude_unset=True)
    return {"agent": public_agent(request.app.state.repository.mutate(lambda s: admin.save_agent(s, data, data.get("id"), upsert=True)))}

@router.delete("", dependencies=[Depends(auth.master)])
def remove(request: Request, body: dict = Body(default={})):
    return request.app.state.repository.mutate(lambda s: admin.delete_agent(s, body.get("id") or request.query_params.get("id")))

@router.get("/{agent_id}/tasks", dependencies=[Depends(auth.agent_auth)])
def context(request: Request, agent_id: str):
    state = request.app.state.repository.read()
    agent = find(state, "agents", agent_id)
    projects = [p for p in state["projects"] if member(p, agent_id)]
    project_ids = {p["id"] for p in projects}
    visible = [t for t in state["tasks"] if t.get("assigneeId") == agent_id or (project_for(state, t) or {}).get("id") in project_ids]
    ids = {t["id"] for t in visible}
    return {"instructions": agent.get("instructions", ""), "personality": agent.get("personality", ""), "heartbeatIntervalMinutes": agent.get("heartbeatIntervalMinutes") or 15,
            "tasks": [t for t in visible if t.get("assigneeId") == agent_id], "projectTasks": visible, "projects": projects, "activities": [a for a in state["activities"] if a.get("taskId") in ids][:200]}

@router.post("/{agent_id}/tasks", dependencies=[Depends(auth.agent_auth)])
def pickup(request: Request, agent_id: str):
    def claim(store):
        tick_schedules(store)
        return claim_next(store, agent_id)
    return {"task": request.app.state.repository.mutate(claim)}

@router.post("/{agent_id}/activity", status_code=201, dependencies=[Depends(auth.agent_auth)])
def activity(request: Request, agent_id: str, body: ActivityInput):
    return {"activity": request.app.state.repository.mutate(lambda s: report(s, agent_id, body.model_dump(exclude_unset=True)))}

@router.post("/{agent_id}/review", dependencies=[Depends(auth.agent_auth)])
def review(request: Request, agent_id: str, body: dict = Body(...)):
    return {"task": request.app.state.repository.mutate(lambda s: lead_review(s, agent_id, body))}

@router.post("/{agent_id}/delegate", status_code=201, dependencies=[Depends(auth.agent_auth)])
def delegate(request: Request, agent_id: str, body: dict = Body(...)):
    return {"task": request.app.state.repository.mutate(lambda s: admin.delegate(s, agent_id, body))}

@router.get("/{agent_id}/messages", dependencies=[Depends(auth.agent_auth)])
def inbox(request: Request, agent_id: str):
    return {"messages": [m for m in request.app.state.repository.read()["messages"] if m["agentId"] == agent_id and not m.get("repliedAt")]}

@router.post("/{agent_id}/messages", dependencies=[Depends(auth.agent_auth)])
def answer(request: Request, agent_id: str, body: dict = Body(...)):
    return {"message": request.app.state.repository.mutate(lambda s: admin.answer_message(s, agent_id, body))}
