"""Verified messaging channels and a transactional, lease-based delivery outbox.

Provider credentials are environment references, never stored in the database.
Network calls happen after committing the delivery claim, outside DB locks.
"""
from copy import deepcopy
from datetime import timedelta
import hashlib
import hmac
import re
import time
import httpx
from .domain import DomainError, date, event, find, iso, now_iso, report, uid

PROVIDERS = {"telegram", "slack", "whatsapp"}
ENV_NAME = re.compile(r"BOT_[A-Z0-9_]{1,100}\Z")


def save_connection(store, agent_id, body):
    agent = find(store, "agents", agent_id)
    if body.get("disconnect"):
        agent.pop("connection", None)
        for row in store.get("outbox", []):
            if row["agentId"] == agent_id and row["status"] in ("queued", "failed"):
                row.update(status="cancelled", lastError="Connection removed")
        return None
    provider = body.get("provider")
    if provider not in PROVIDERS:
        raise DomainError("Choose Telegram, Slack or WhatsApp")
    destination = str(body.get("destination") or "").strip()
    allowed = body.get("allowedSenders") or []
    if isinstance(allowed, str):
        allowed = [v.strip() for v in allowed.split(",") if v.strip()]
    if not isinstance(allowed, list) or not allowed or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9_+\-]{1,100}", v) for v in allowed):
        raise DomainError("At least one allowed sender ID is required")
    patterns = {"telegram": r"-?\d{1,25}", "slack": r"[CDG][A-Z0-9]{1,40}", "whatsapp": r"\d{7,16}"}
    if not re.fullmatch(patterns[provider], destination):
        raise DomainError("Invalid chat, channel or WhatsApp recipient ID")
    config = {"id": uid("connection"), "provider": provider, "destination": destination,
              "allowedSenders": list(dict.fromkeys(allowed)), "enabled": bool(body.get("enabled", True)), "updatedAt": now_iso()}
    for key in ("tokenEnv", "secretEnv"):
        ref = str(body.get(key) or "")
        if not ENV_NAME.fullmatch(ref):
            raise DomainError(f"{key} must name a BOT_ environment variable; do not paste a credential")
        config[key] = ref
    if provider == "slack":
        if not re.fullmatch(r"T[A-Z0-9]{1,40}", str(body.get("workspaceId") or "")):
            raise DomainError("Slack workspace ID is required")
        config["workspaceId"] = body["workspaceId"]
    if provider == "whatsapp":
        if allowed != [destination]:
            raise DomainError("WhatsApp allowed sender must equal its recipient number")
        if not str(body.get("accountId") or "").isdigit() or not re.fullmatch(r"v\d+\.\d+", str(body.get("apiVersion") or "")):
            raise DomainError("WhatsApp phone number ID and supported Graph API version are required")
        verify = str(body.get("verifyTokenEnv") or "")
        if not ENV_NAME.fullmatch(verify):
            raise DomainError("verifyTokenEnv must name a BOT_ environment variable")
        config.update(accountId=body["accountId"], apiVersion=body["apiVersion"], verifyTokenEnv=verify,
                      templateName=str(body.get("templateName") or ""), templateLanguage=str(body.get("templateLanguage") or "en_US"))
    # A new generation prevents queued work from being redirected to a new chat.
    agent.update(connection=config, platform={"telegram": "Telegram", "slack": "Slack", "whatsapp": "WhatsApp"}[provider], updatedAt=now_iso())
    for row in store.get("outbox", []):
        if row["agentId"] == agent_id and row["status"] in ("queued", "failed"):
            row.update(status="cancelled", lastError="Connection changed")
    return config


def connection_health(connection, settings):
    if not connection:
        return {"state": "not_connected", "missing": []}
    env = settings.integration_env or {}
    keys = [connection["tokenEnv"], connection["secretEnv"]]
    if connection["provider"] == "whatsapp":
        keys.append(connection["verifyTokenEnv"])
    missing = [key for key in keys if not env.get(key)]
    return {"state": "disabled" if not connection.get("enabled") else "needs_credentials" if missing else "configured", "missing": missing}


def queue_text(store, agent_id, text, message_id=None, task_id=None):
    agent = find(store, "agents", agent_id, False)
    connection = (agent or {}).get("connection")
    if not connection or not connection.get("enabled"):
        return []
    rows = []
    for start in range(0, len(text), 3500):
        row = {"id": uid("delivery"), "agentId": agent_id, "connectionId": connection["id"], "provider": connection["provider"],
               "text": text[start:start+3500], "messageId": message_id, "taskId": task_id,
               "status": "queued", "attempts": 0, "createdAt": now_iso()}
        store.setdefault("outbox", []).append(row)
        rows.append(row)
    return rows


def notify_task(store, activity):
    if activity["kind"] not in ("assigned", "re-assigned", "approved", "changes_requested", "comment", "status"):
        return
    if activity.get("actor") != "operator" and activity["kind"] not in ("approved", "changes_requested"):
        return
    task = find(store, "tasks", activity.get("taskId"), False)
    title = task["title"] if task else (activity.get("meta") or {}).get("taskTitle", activity.get("taskId", "Task"))
    text = f"{activity['kind'].replace('_', ' ').title()}: {title}\nTask: {activity.get('taskId')}\n{activity['message']}"
    target = task.get("assigneeId") if task and activity["kind"] in ("approved", "changes_requested") else activity["agentId"]
    queue_text(store, target, text[:3000], task_id=activity.get("taskId"))


def verify_webhook(connection, settings, headers, raw):
    secret = (settings.integration_env or {}).get(connection["secretEnv"], "")
    if not secret:
        raise DomainError("Channel verification secret is not configured", 503)
    provider = connection["provider"]
    if provider == "telegram":
        valid = hmac.compare_digest(headers.get("x-telegram-bot-api-secret-token", "").encode(), secret.encode())
    elif provider == "slack":
        stamp = headers.get("x-slack-request-timestamp", "")
        if not stamp.isdigit() or len(stamp) > 12 or abs(time.time()-int(stamp)) > 300:
            raise DomainError("Expired Slack request", 401)
        signature = "v0=" + hmac.new(secret.encode(), b"v0:" + stamp.encode() + b":" + raw, hashlib.sha256).hexdigest()
        valid = hmac.compare_digest(headers.get("x-slack-signature", "").encode(), signature.encode())
    else:
        signature = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        valid = hmac.compare_digest(headers.get("x-hub-signature-256", "").encode(), signature.encode())
    if not valid:
        raise DomainError("Invalid channel signature", 401)


def incoming_items(connection, payload):
    provider = connection["provider"]
    if provider == "telegram":
        msg = payload.get("message", {})
        if str(msg.get("chat", {}).get("id")) != connection["destination"]:
            return []
        return [{"id": str(payload.get("update_id", "")), "sender": str(msg.get("from", {}).get("id", "")),
                 "text": msg.get("text", ""), "replyTo": str(msg.get("reply_to_message", {}).get("message_id", ""))}]
    if provider == "slack":
        msg = payload.get("event", {})
        own_users = {a.get("user_id") for a in payload.get("authorizations", []) if a.get("is_bot")}
        if msg.get("user") and msg["user"] in own_users:
            return []
        if payload.get("team_id") != connection.get("workspaceId") or msg.get("channel") != connection["destination"] or msg.get("type") not in ("message", "app_mention") or msg.get("subtype") in ("message_changed", "message_deleted"):
            return []
        return [{"id": f"{msg.get('channel')}:{msg['ts']}" if msg.get("ts") else payload.get("event_id", ""), "sender": msg.get("user") or msg.get("bot_id", ""),
                 "text": re.sub(r"^<@[A-Z0-9]+>\s*", "", msg.get("text", "")), "replyTo": msg.get("thread_ts", "")}]
    items = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if str(value.get("metadata", {}).get("phone_number_id")) != connection.get("accountId"):
                continue
            for msg in value.get("messages", []):
                if msg.get("from") == connection["destination"] and msg.get("type") == "text":
                    items.append({"id": msg.get("id", ""), "sender": msg.get("from", ""), "text": msg.get("text", {}).get("body", ""), "replyTo": msg.get("context", {}).get("id", "")})
    return items


HELP = "Commands: /heartbeat; /accept TASK_ID; /start TASK_ID; /progress TASK_ID update; /block TASK_ID reason; /reject TASK_ID reason; /submit TASK_ID title | result; /reply MESSAGE_ID reply. Work is completed after dashboard review."


def receive(store, agent_id, connection_id, items):
    from .admin import answer_message
    agent = find(store, "agents", agent_id)
    connection = agent.get("connection", {})
    if connection.get("id") != connection_id or not connection.get("enabled"):
        raise DomainError("Connection changed or disabled", 409)
    count = 0
    for item in items:
        if item["sender"] not in connection["allowedSenders"] or not item["id"] or not item["text"]:
            continue
        key = f"{connection_id}:{item['id']}"
        if any(r["id"] == key for r in store.get("channelReceipts", [])):
            continue
        text = str(item["text"])[:20000].strip()
        now = now_iso()
        outcome = "received"
        error = None
        if text.startswith("/"):
            # Commit commands atomically; a rejected command must not partially mutate a task.
            working = deepcopy(store)
            try:
                head, _, rest = text.partition(" ")
                command = head.split("@")[0].lower()
                if command == "/help" or (command == "/start" and not rest):
                    queue_text(working, agent_id, HELP)
                elif command == "/heartbeat":
                    report(working, agent_id, {"kind": "heartbeat", "message": "Channel heartbeat"})
                elif command == "/reply":
                    message_id, _, reply = rest.partition(" ")
                    answer_message(working, agent_id, {"messageId": message_id, "reply": reply})
                else:
                    task_id, _, content = rest.partition(" ")
                    kinds = {"/accept": "accepted", "/start": "started", "/progress": "progress", "/block": "blocked", "/reject": "rejected", "/submit": "submitted"}
                    if command not in kinds or not task_id:
                        raise DomainError("Unknown command. Send /help for supported commands")
                    data = {"taskId": task_id, "kind": kinds[command], "message": content or kinds[command]}
                    if command == "/submit":
                        title, sep, result = content.partition("|")
                        if not sep:
                            raise DomainError("Use /submit TASK_ID title | result")
                        data["deliverable"] = {"title": title.strip(), "content": result.strip()}
                    report(working, agent_id, data)
                store.clear()
                store.update(working)
                agent = find(store, "agents", agent_id)
                connection = agent["connection"]
                outcome = "applied"
            except DomainError as exc:
                outcome, error = "rejected", str(exc)
                queue_text(store, agent_id, f"Update rejected: {error}")
        else:
            linked = next((r for r in store.get("outbox", []) if r.get("connectionId") == connection_id and r.get("providerMessageId") == item.get("replyTo") and item.get("replyTo") and r.get("messageId")), None)
            answered = False
            if linked:
                message = find(store, "messages", linked["messageId"], False)
                if message and not message.get("repliedAt"):
                    answer_message(store, agent_id, {"messageId": message["id"], "reply": text})
                    answered = True
            if not answered:
                store["messages"].append({"id": uid("message"), "agentId": agent_id, "text": text, "direction": "inbound", "provider": connection["provider"], "sender": item["sender"], "createdAt": now})
                event(store, agent_id, "message", text, at=now)
                agent.update(lastActivity=now, lastActivityText=text[:280], updatedAt=now)
        connection.update(lastInboundAt=now)
        store.setdefault("channelReceipts", []).append({"id": key, "agentId": agent_id, "at": now, "outcome": outcome, "error": error})
        count += 1
    return count


def claim_delivery(store, agent_id=None):
    now = now_iso()
    for index, row in enumerate(store.get("outbox", [])):
        if agent_id and row["agentId"] != agent_id:
            continue
        if row["status"] == "sending" and row.get("leaseUntil", now) <= now:
            row.update(status="unknown", lastError="Worker stopped during delivery; check the conversation before retrying")
        if row["status"] != "queued" or row.get("nextAttemptAt", now) > now:
            continue
        if row.get("messageId") and any(previous.get("messageId") == row["messageId"] and previous["status"] != "sent" for previous in store["outbox"][:index]):
            continue
        agent = find(store, "agents", row["agentId"], False)
        connection = (agent or {}).get("connection", {})
        if connection.get("id") != row["connectionId"] or not connection.get("enabled"):
            row.update(status="cancelled", lastError="Connection changed or disabled")
            continue
        lease = uid("lease")
        row.update(status="sending", lease=lease, leaseUntil=iso(date(now)+timedelta(minutes=2)), attempts=row["attempts"]+1)
        return {"row": deepcopy(row), "connection": deepcopy(connection)}
    return None


def send_provider(connection, row, settings, client):
    env = settings.integration_env or {}
    token = env.get(connection["tokenEnv"], "")
    if not token:
        return {"status": "failed", "lastError": "Provider token is not configured"}
    text = row["text"]
    if row.get("taskId"):
        text += f"\n{settings.public_url}/tasks/{row['taskId']}"
    headers = {"Authorization": f"Bearer {token}"}
    provider = connection["provider"]
    if provider == "telegram":
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        headers = {}
        body = {"chat_id": connection["destination"], "text": text, "link_preview_options": {"is_disabled": True}}
    elif provider == "slack":
        url = "https://slack.com/api/chat.postMessage"
        body = {"channel": connection["destination"], "text": text, "unfurl_links": False, "unfurl_media": False, "mrkdwn": False}
    else:
        url = f"https://graph.facebook.com/{connection['apiVersion']}/{connection['accountId']}/messages"
        body = {"messaging_product": "whatsapp", "to": connection["destination"]}
        in_window = connection.get("lastInboundAt") and (date(now_iso())-date(connection["lastInboundAt"])).total_seconds() < 86400
        if in_window:
            body.update(type="text", text={"body": text})
        elif connection.get("templateName"):
            body.update(type="template", template={"name": connection["templateName"], "language": {"code": connection["templateLanguage"]}, "components": [{"type": "body", "parameters": [{"type": "text", "text": text}]}]})
        else:
            return {"status": "failed", "lastError": "WhatsApp needs a recent inbound message or an approved one-body-parameter template"}
    try:
        response = client.post(url, json=body, headers=headers)
        data = response.json()
    except (httpx.TransportError, ValueError):
        # Provider may have accepted it. Automatic retries could duplicate the message.
        return {"status": "unknown", "lastError": "Delivery outcome unknown; check the provider conversation before retrying"}
    if response.status_code == 429:
        retry = str(response.headers.get("retry-after", "60"))
        seconds = min(max(int(retry) if retry.isdigit() else 60, 1), 3600)
        return {"status": "queued" if row["attempts"] < 5 else "failed", "lastError": "Provider rate limit", "nextAttemptAt": iso(date(now_iso())+timedelta(seconds=seconds))}
    if response.status_code >= 500:
        return {"status": "unknown", "lastError": "Provider error; check the conversation before retrying"}
    if not isinstance(data, dict):
        return {"status": "unknown", "lastError": "Unexpected provider response; check the conversation before retrying"}
    ok = response.is_success and (data.get("ok", True) is True)
    try:
        provider_id = str(data.get("result", {}).get("message_id", "")) if provider == "telegram" else str(data.get("ts", "")) if provider == "slack" else str((data.get("messages") or [{}])[0].get("id", ""))
    except (AttributeError, IndexError, TypeError):
        provider_id = ""
    if ok and not provider_id:
        return {"status": "unknown", "lastError": "Provider accepted without a message ID; check the conversation before retrying"}
    if not ok:
        # Never persist raw error bodies/URLs: they can echo provider tokens.
        return {"status": "failed", "lastError": f"Provider rejected delivery (HTTP {response.status_code}); check credentials, permissions and destination"}
    return {"status": "sent", "providerMessageId": provider_id, "sentAt": now_iso(), "lastError": None}


def dispatch(repository, settings, agent_id=None, limit=10, client=None):
    def finish(store, row, outcome):
        saved = find(store, "outbox", row["id"])
        if saved.get("lease") != row["lease"] or saved["status"] != "sending":
            return
        saved.update(outcome)
        agent = find(store, "agents", saved["agentId"], False)
        if agent and agent.get("connection", {}).get("id") == saved["connectionId"]:
            agent["connection"].update(lastOutboundAt=saved.get("sentAt"), lastDeliveryStatus=saved["status"], lastError=saved.get("lastError"))
        if saved.get("messageId"):
            message = find(store, "messages", saved["messageId"], False)
            if message:
                parts = [r for r in store["outbox"] if r.get("messageId") == message["id"]]
                message["deliveryStatus"] = "sent" if all(r["status"] == "sent" for r in parts) else next((r["status"] for r in parts if r["status"] in ("failed", "unknown")), "queued")
    # Avoid rewriting the aggregate document every time an idle worker polls.
    rows = repository.read().get("outbox", [])
    now = now_iso()
    if not any((not agent_id or r["agentId"] == agent_id) and (r["status"] == "queued" and r.get("nextAttemptAt", now) <= now or r["status"] == "sending" and r.get("leaseUntil", now) <= now) for r in rows):
        return {"processed": 0}
    count = 0
    with httpx.Client(timeout=10, follow_redirects=False) if client is None else _borrow(client) as transport:
        for _ in range(limit):
            claim = repository.mutate(lambda s: claim_delivery(s, agent_id))
            if not claim:
                break
            outcome = send_provider(claim["connection"], claim["row"], settings, transport)
            repository.mutate(lambda s: finish(s, claim["row"], outcome))
            count += 1
    return {"processed": count}


from contextlib import contextmanager
@contextmanager
def _borrow(client):
    yield client


def receive_statuses(store, agent_id, connection_id, payload):
    agent = find(store, "agents", agent_id)
    connection = agent.get("connection", {})
    if connection.get("id") != connection_id or connection.get("provider") != "whatsapp" or not connection.get("enabled"):
        return
    ranks = {"sent": 1, "delivered": 2, "read": 3}
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if str(value.get("metadata", {}).get("phone_number_id")) != connection.get("accountId"):
                continue
            for update in value.get("statuses", []):
                if update.get("recipient_id") != connection["destination"]:
                    continue
                row = next((r for r in store.get("outbox", []) if r["connectionId"] == connection_id and r.get("providerMessageId") == update.get("id")), None)
                status = update.get("status")
                if not row or status not in (*ranks, "failed") or row.get("providerStatus") == "read":
                    continue
                if status != "failed" and ranks.get(row.get("providerStatus"), 0) > ranks[status]:
                    continue
                row["providerStatus"] = status
                connection.update(lastDeliveryStatus=status, lastError="WhatsApp reported a delivery failure" if status == "failed" else None)
                if status == "failed":
                    row.update(status="failed", lastError="WhatsApp reported a delivery failure")
                if row.get("messageId"):
                    message = find(store, "messages", row["messageId"], False)
                    if message:
                        parts = [r for r in store["outbox"] if r.get("messageId") == message["id"]]
                        if status == "failed":
                            message["deliveryStatus"] = "failed"
                        elif all(r.get("providerStatus") in ("delivered", "read") for r in parts):
                            message.update(deliveryStatus="read" if all(r.get("providerStatus") == "read" for r in parts) else "delivered", deliveredAt=message.get("deliveredAt") or now_iso())


def deliver_after_write(repository, settings, agent_id):
    """Best-effort low-latency send; the durable worker/cron remains the fallback."""
    try:
        dispatch(repository, settings, agent_id, limit=5)
    except Exception:
        # The committed queue survives. Do not leak database/provider URLs to logs.
        return
