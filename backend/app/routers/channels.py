import hmac
import json
from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import PlainTextResponse
from .. import auth, channels
from ..domain import DomainError, find, now_iso

router = APIRouter(tags=["messaging channels"])


def configuration(request, agent_id):
    agent = find(request.app.state.repository.read(), "agents", agent_id)
    connection = agent.get("connection")
    return {"connection": connection, "health": channels.connection_health(connection, request.app.state.settings),
            "webhookUrl": f"{request.app.state.settings.public_url}/api/channels/{agent_id}/webhook"}


@router.get("/api/registry/{agent_id}/channel", dependencies=[Depends(auth.dashboard)])
def get_connection(request: Request, agent_id: str):
    return configuration(request, agent_id)


@router.put("/api/registry/{agent_id}/channel", dependencies=[Depends(auth.dashboard)])
def configure(request: Request, agent_id: str, body: dict = Body(...)):
    request.app.state.repository.mutate(lambda s: channels.save_connection(s, agent_id, body))
    return configuration(request, agent_id)


@router.get("/api/registry/{agent_id}/deliveries", dependencies=[Depends(auth.dashboard)])
def deliveries(request: Request, agent_id: str):
    store = request.app.state.repository.read()
    find(store, "agents", agent_id)
    rows = [r for r in store.get("outbox", []) if r["agentId"] == agent_id]
    return {"deliveries": list(reversed(rows[-100:])), "counts": {status: sum(r["status"] == status for r in rows) for status in ("queued", "sending", "sent", "failed", "unknown", "cancelled")}}


@router.post("/api/registry/{agent_id}/deliveries", dependencies=[Depends(auth.dashboard)])
def delivery_action(request: Request, agent_id: str, body: dict = Body(default={})):
    repository = request.app.state.repository
    find(repository.read(), "agents", agent_id)
    if body.get("action") == "dispatch":
        return channels.dispatch(repository, request.app.state.settings, agent_id, limit=5)
    def retry(store):
        row = find(store, "outbox", body.get("id"))
        if row["agentId"] != agent_id or row["status"] not in ("failed", "unknown"):
            raise DomainError("Only failed or unknown deliveries for this agent can be retried", 409)
        connection = find(store, "agents", agent_id).get("connection", {})
        if connection.get("id") != row["connectionId"] or not connection.get("enabled"):
            raise DomainError("Delivery belongs to a previous or disabled connection", 409)
        if row["status"] == "unknown" and body.get("confirmDuplicateRisk") is not True:
            raise DomainError("Check the provider conversation, then confirmDuplicateRisk to retry an unknown outcome", 409)
        row.update(status="queued", attempts=0, nextAttemptAt=now_iso(), lastError=None)
        return {"queued": True}
    if body.get("action") != "retry":
        raise DomainError("Choose dispatch or retry")
    return repository.mutate(retry)


@router.get("/api/channels/{agent_id}/webhook")
def verify_subscription(request: Request, agent_id: str):
    agent = find(request.app.state.repository.read(), "agents", agent_id)
    connection = agent.get("connection", {})
    if connection.get("provider") != "whatsapp":
        raise DomainError("Only WhatsApp uses this verification endpoint", 404)
    token = (request.app.state.settings.integration_env or {}).get(connection.get("verifyTokenEnv"), "")
    supplied = request.query_params.get("hub.verify_token", "")
    if not token or request.query_params.get("hub.mode") != "subscribe" or not hmac.compare_digest(token, supplied):
        raise DomainError("Invalid verification token", 401)
    return PlainTextResponse(request.query_params.get("hub.challenge", ""))


@router.post("/api/channels/{agent_id}/webhook")
async def webhook(request: Request, agent_id: str):
    repository = request.app.state.repository
    connection = find(repository.read(), "agents", agent_id).get("connection")
    if not connection:
        raise DomainError("Channel not configured", 404)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 262144:
            raise DomainError("Webhook payload too large", 413)
    channels.verify_webhook(connection, request.app.state.settings, request.headers, bytes(raw))
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError()
    except (ValueError, UnicodeDecodeError):
        raise DomainError("Invalid webhook JSON")
    if connection["provider"] == "slack" and payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge", "")}
    if not connection.get("enabled"):
        return {"received": 0}
    try:
        items = channels.incoming_items(connection, payload)
    except (AttributeError, TypeError):
        raise DomainError("Invalid provider event")
    def apply(store):
        count = channels.receive(store, agent_id, connection["id"], items)
        if connection["provider"] == "whatsapp":
            try:
                channels.receive_statuses(store, agent_id, connection["id"], payload)
            except (AttributeError, TypeError):
                raise DomainError("Invalid delivery status")
        return count
    count = repository.mutate(apply) if items or connection["provider"] == "whatsapp" else 0
    return {"received": count}
