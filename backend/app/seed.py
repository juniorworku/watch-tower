"""Seed only an empty database; importing Blob data is a separate explicit operation."""
import json
import re
from pathlib import Path
import yaml
from .domain import COLLECTIONS, now_iso

SNAPSHOT = Path(__file__).resolve().parents[1] / "content/vault-snapshot.json"

def empty_state():
    now = now_iso()
    return {"version": 1, "seededAt": now, "updatedAt": now, **{key: [] for key in COLLECTIONS}}


def parse_note(file):
    content = file["content"].lstrip("\ufeff")
    frontmatter = {}
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", content)
    if match:
        try:
            parsed = yaml.safe_load(match[1])
            frontmatter = parsed if isinstance(parsed, dict) else {}
        except yaml.YAMLError:
            pass
        content = content[match.end():]
    path = file["path"]
    name = Path(path).stem
    heading = re.search(r"^#\s+(.+)$", content, re.M)
    return {"path": path, "name": name, "folder": str(Path(path).parent), "title": heading[1].strip() if heading else name, "frontmatter": frontmatter, "body": content}


def build_seed():
    store = empty_state()
    snapshot = json.loads(SNAPSHOT.read_text())
    now = store["updatedAt"]
    for file in snapshot["files"]:
        if file["path"].startswith("Templates/"):
            continue
        note = parse_note(file)
        fm = note["frontmatter"]
        slug = re.sub(r"[^a-z0-9]+", "-", note["name"].lower()).strip("-")
        if note["folder"] == "Tasks" and fm.get("type") == "task":
            status = str(fm.get("status", "todo")).lower()
            store["tasks"].append({"id": f"task-{slug}", "title": note["title"], "status": status if status in ("todo", "doing", "blocked", "done") else "todo", "owners": [o.strip() for o in re.split(r"[/,&]", str(fm.get("owner", ""))) if o.strip()], "project": str(fm.get("project", "")), "due": str(fm.get("due", "")), "body": note["body"], "createdAt": str(fm.get("created", now)), "updatedAt": now})
        if fm.get("type") == "project":
            archived = note["folder"].startswith("Projects/Archive")
            store["projects"].append({"id": f"proj-{slug}", "name": note["title"], "status": str(fm.get("status", "archived" if archived else "active")), "archived": archived, "owner": str(fm.get("owner", "")), "started": str(fm.get("started", "")), "body": note["body"], "createdAt": now, "updatedAt": now, "memberIds": []})
        if note["folder"] == "Memory/Daily" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", note["name"]):
            store["logs"].append({"id": f"log-{note['name']}", "date": note["name"], "body": note["body"], "createdAt": now, "updatedAt": now})
    for agent_id, name, role, parent, agent_tags in [
        ("liz-admin-coo", "Liz", "Admin & COO", None, ["orchestrator", "cosmos"]),
        ("04ec2749-2259-46de-a6b0-de796e045582", "Daily Brief", "Morning Brief producer", "liz-admin-coo", ["morning-brief"]),
        ("b6190cf7-749c-4463-9ef2-ac79ed8437f5", "Micro-MVP Workshop", "Micro-MVP pipeline runner", "liz-admin-coo", ["mvp", "pipeline"]),
    ]:
        store["agents"].append({"id": agent_id, "name": name, "role": role, "type": "agent" if parent is None else "bot", "parentId": parent, "platform": "Grok Bot", "owner": "Junior Worku", "status": "active", "tags": agent_tags, "url": "", "webhook": "", "createdAt": now, "updatedAt": now, "lastHeartbeat": None, "lastActivity": None, "lastActivityText": None})
    return store
