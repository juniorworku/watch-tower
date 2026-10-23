"""Read-only external adapters. All credentials and provider calls stay in FastAPI."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import time
from urllib.parse import quote
import httpx
from .domain import now_iso

GOOGLE_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
DEFAULT_FOLDER = "1CHIRqiewFlQF4JvzPgxXJDRSV2L-lXdl"
SPECS = [
    ("google-drive", "Google Drive (vault sync)", "Reads the live Markdown vault; falls back to the bundled snapshot when unavailable.", GOOGLE_KEYS, ["GOOGLE_DRIVE_VAULT_FOLDER_ID"]),
    ("notion", "Notion (reading log)", "Reads recent entries from a connected page or database.", ["NOTION_TOKEN", "NOTION_READING_LOG_ID"], []),
    ("slack", "Slack", "Checks workspace connectivity and optionally reads recent channel messages.", ["SLACK_BOT_TOKEN"], ["SLACK_CHANNEL_ID"]),
    ("google-calendar", "Google Calendar", "Reads upcoming calendar events.", GOOGLE_KEYS, ["GOOGLE_CALENDAR_ID"]),
    ("gmail", "Gmail", "Reads inbox counts only; no message bodies.", GOOGLE_KEYS, []),
    ("obsidian", "Obsidian (vault Markdown)", "Serves the live Drive vault or the bundled offline snapshot.", [], ["VAULT_SOURCE_DIR"]),
]
DESCRIPTIONS = {
    "GOOGLE_CLIENT_ID": "Google OAuth client ID.", "GOOGLE_CLIENT_SECRET": "Google OAuth client secret.", "GOOGLE_REFRESH_TOKEN": "Refresh token with read-only Drive, Calendar and Gmail metadata scopes.",
    "GOOGLE_DRIVE_VAULT_FOLDER_ID": f"Vault folder ID; defaults to {DEFAULT_FOLDER}.", "GOOGLE_CALENDAR_ID": "Calendar ID; defaults to primary.",
    "NOTION_TOKEN": "Notion read-only integration token.", "NOTION_READING_LOG_ID": "Reading log page/database ID.", "SLACK_BOT_TOKEN": "Slack bot OAuth token.", "SLACK_CHANNEL_ID": "Optional channel for recent messages.", "VAULT_SOURCE_DIR": "Source for the manual snapshot tool; defaults to the sibling watchtower vault.",
}

class Integrations:
    def __init__(self, settings):
        self.env = settings.integration_env or {}
        self.token_cache = None
        self.vault_cache = None

    def configured(self, integration):
        spec = next(s for s in SPECS if s[0] == integration)
        return all(self.env.get(key) for key in spec[3])

    def request(self, url, method="GET", **kwargs):
        try:
            with httpx.Client(timeout=8) as client:
                response = client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
        except httpx.HTTPStatusError as error:
            raise RuntimeError(f"Remote service returned HTTP {error.response.status_code}") from None
        except httpx.HTTPError:
            raise RuntimeError("Remote service request failed or timed out") from None

    def google_token(self):
        if self.token_cache and self.token_cache[1] > time.time() + 60:
            return self.token_cache[0]
        result = self.request("https://oauth2.googleapis.com/token", "POST", data={"client_id": self.env["GOOGLE_CLIENT_ID"], "client_secret": self.env["GOOGLE_CLIENT_SECRET"], "refresh_token": self.env["GOOGLE_REFRESH_TOKEN"], "grant_type": "refresh_token"}).json()
        self.token_cache = (result["access_token"], time.time() + result.get("expires_in", 3600))
        return result["access_token"]

    def google(self, url, **kwargs):
        return self.request(url, headers={"Authorization": f"Bearer {self.google_token()}"}, **kwargs).json()

    def slack(self, method, params=None):
        value = self.request(f"https://slack.com/api/{method}", headers={"Authorization": f"Bearer {self.env['SLACK_BOT_TOKEN']}"}, params=params or {}).json()
        if not value.get("ok"):
            raise RuntimeError("Slack rejected the request")
        return value

    def notion(self, route, method="GET", **kwargs):
        return self.request(f"https://api.notion.com/v1/{route}", method, headers={"Authorization": f"Bearer {self.env['NOTION_TOKEN']}", "Notion-Version": "2022-06-28"}, **kwargs).json()

    def snapshot(self, warning=None):
        value = json.loads((Path(__file__).resolve().parents[1] / "content/vault-snapshot.json").read_text())
        source = {"kind": "snapshot", "label": "Bundled snapshot", "asOf": value["takenAt"]}
        if warning:
            source["warning"] = warning
        return {"files": value["files"], "source": source}

    def vault(self):
        if self.vault_cache and self.vault_cache[0] > time.time() - 60:
            return self.vault_cache[1]
        if not self.configured("google-drive"):
            return self.snapshot()
        try:
            files = []
            queue = [(self.env.get("GOOGLE_DRIVE_VAULT_FOLDER_ID") or DEFAULT_FOLDER, "", 0)]
            while queue:
                folder, prefix, depth = queue.pop(0)
                token = None
                while True:
                    params = {"q": f"'{folder}' in parents and trashed = false", "fields": "nextPageToken,files(id,name,mimeType)", "pageSize": 200, "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
                    if token:
                        params["pageToken"] = token
                    page = self.google("https://www.googleapis.com/drive/v3/files", params=params)
                    for file in page.get("files", []):
                        if file["name"].startswith("."):
                            continue
                        if file["mimeType"] == "application/vnd.google-apps.folder" and depth < 6:
                            queue.append((file["id"], prefix + file["name"] + "/", depth+1))
                        elif file["name"].lower().endswith(".md"):
                            response = self.request(f"https://www.googleapis.com/drive/v3/files/{quote(file['id'], safe='')}", headers={"Authorization": f"Bearer {self.google_token()}"}, params={"alt": "media", "supportsAllDrives": "true"})
                            files.append({"path": prefix + file["name"], "content": response.text})
                    token = page.get("nextPageToken")
                    if not token:
                        break
            if not files:
                raise RuntimeError("Drive folder returned no Markdown files")
            value = {"files": sorted(files, key=lambda f: f["path"]), "source": {"kind": "drive", "label": "Live from Google Drive", "asOf": now_iso()}}
        except (RuntimeError, KeyError, ValueError, TypeError):
            value = self.snapshot("Live Drive read failed; showing bundled snapshot.")
        self.vault_cache = (time.time(), value)
        return value

    def fetch(self, integration):
        if not self.configured(integration):
            return {"ok": False, "reason": "not_configured", "message": "Integration is not configured on the backend."}
        try:
            if integration == "gmail":
                profile = self.google("https://gmail.googleapis.com/gmail/v1/users/me/profile")
                inbox = self.google("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX")
                data = {"email": profile["emailAddress"], "inboxUnread": inbox.get("messagesUnread", 0), "inboxTotal": inbox.get("messagesTotal", 0)}
            elif integration == "slack":
                profile = self.slack("auth.test")
                data = {"team": profile["team"], "botUser": profile["user"]}
                if self.env.get("SLACK_CHANNEL_ID"):
                    channel = self.env["SLACK_CHANNEL_ID"]
                    messages = self.slack("conversations.history", {"channel": channel, "limit": 5})["messages"]
                    data["channel"] = {"id": channel, "recent": [{"ts": m["ts"], "text": m.get("text", "")[:200]} for m in messages]}
            elif integration == "notion":
                log_id = self.env["NOTION_READING_LOG_ID"].replace("-", "").strip()
                try:
                    page = self.notion(f"databases/{quote(log_id, safe='')}/query", "POST", json={"page_size": 5, "sorts": [{"timestamp": "last_edited_time", "direction": "descending"}]})
                    data = {"kind": "database", "items": [{"id": p["id"], "title": next(("".join(t.get("plain_text", "") for t in v.get("title", [])) for v in p.get("properties", {}).values() if v.get("type") == "title"), "(untitled)"), "url": p.get("url"), "lastEdited": p["last_edited_time"]} for p in page["results"]]}
                except RuntimeError:
                    page = self.notion(f"blocks/{quote(log_id, safe='')}/children?page_size=50")
                    items = []
                    for b in page["results"]:
                        inner = b.get(b["type"], {})
                        text = inner.get("title") or "".join(t.get("plain_text", "") for t in inner.get("rich_text", []))
                        if text:
                            items.append({"id": b["id"], "title": text, "lastEdited": b["last_edited_time"]})
                    data = {"kind": "page", "items": items[-5:][::-1]}
            elif integration == "google-calendar":
                cal_id = quote(self.env.get("GOOGLE_CALENDAR_ID", "primary"), safe="")
                result = self.google(f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events", params={"timeMin": now_iso(), "maxResults": 5, "singleEvents": "true", "orderBy": "startTime"})
                data = [{"id": e["id"], "summary": e.get("summary", "(no title)"), "start": e.get("start", {}).get("dateTime", e.get("start", {}).get("date", "")), "end": e.get("end", {}).get("dateTime", e.get("end", {}).get("date", "")), "allDay": "dateTime" not in e.get("start", {}), "htmlLink": e.get("htmlLink")} for e in result.get("items", [])]
            elif integration == "google-drive":
                folder = self.env.get("GOOGLE_DRIVE_VAULT_FOLDER_ID") or DEFAULT_FOLDER
                data = self.google(f"https://www.googleapis.com/drive/v3/files/{quote(folder, safe='')}?fields=id,name&supportsAllDrives=true")
            else:
                vault = self.vault()
                data = {"noteCount": len(vault["files"]), "source": vault["source"]["label"]}
            return {"ok": True, "data": data, "fetchedAt": now_iso()}
        except (RuntimeError, KeyError, ValueError, TypeError):
            return {"ok": False, "reason": "error", "message": "Read-only integration request failed. Check backend configuration and provider access."}

    def bundle(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = dict(zip([s[0] for s in SPECS], pool.map(self.fetch, [s[0] for s in SPECS])))
        metadata = {s["id"]: s for s in json.loads((Path(__file__).resolve().parents[1] / "content/integration-specs.json").read_text())}
        health = []
        for integration, name, purpose, required, optional in SPECS:
            result = results[integration]
            status = "connected" if result["ok"] else result["reason"]
            if integration == "obsidian" and self.vault()["source"]["kind"] == "snapshot":
                status = "snapshot"
            env_vars = [{"name": k, "description": DESCRIPTIONS[k], "required": k in required, "configured": bool(self.env.get(k))} for k in required + optional]
            adapter = metadata[integration]
            adapter["envVars"] = [{**spec, "configured": bool(self.env.get(spec["name"]))} for spec in adapter["envVars"]]
            health.append({"adapter": adapter, "health": {"status": status, "detail": "Read-only connection available." if result["ok"] else result["message"], "checkedAt": now_iso()}})
        return {"health": health, "data": results}
