import { NextResponse, type NextRequest } from "next/server";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import type { AgentItem, AgentType } from "@/lib/data/types";

export const runtime = "nodejs";
const TYPES: AgentType[] = ["bot", "agent", "sub-agent"];

export async function GET() {
  const store = await loadStore();
  return NextResponse.json({ agents: store.agents.map(({ credentialHash: _hash, ...a }) => a) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.heartbeatIntervalMinutes != null && (!Number.isInteger(body.heartbeatIntervalMinutes) || body.heartbeatIntervalMinutes < 1 || body.heartbeatIntervalMinutes > 1440)) return NextResponse.json({ error: "heartbeat interval must be 1–1440 minutes" }, { status: 400 });
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const type = (TYPES.includes(body.type) ? body.type : "agent") as AgentType;
  const parentId = body.parentId ? String(body.parentId) : null;
  if (type === "sub-agent" && !parentId) {
    return NextResponse.json({ error: "parentId required for sub-agent" }, { status: 400 });
  }
  const store0 = await loadStore();
  if (parentId && !store0.agents.some((a) => a.id === parentId)) {
    return NextResponse.json({ error: "parentId not found" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const agent: AgentItem = {
    id: newId("agent"),
    name,
    platform: String(body.platform || "custom").trim(),
    type,
    parentId,
    role: String(body.role || "").trim(),
    owner: String(body.owner || "").trim(),
    status: String(body.status || "active").trim(),
    url: String(body.url || "").trim(),
    webhook: String(body.webhook || "").trim(),
    tags: String(body.tags || "")
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean),
    createdAt: now,
    updatedAt: now,
    personality: String(body.personality || "").trim(),
    instructions: String(body.instructions || "").trim(),
    heartbeatIntervalMinutes: body.heartbeatIntervalMinutes || 15,
    lastHeartbeat: null,
    lastActivity: null,
    lastActivityText: null,
  };
  await mutateStore((s) => {
    s.agents.push(agent);
  });
  return NextResponse.json({ agent }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.heartbeatIntervalMinutes != null && (!Number.isInteger(body.heartbeatIntervalMinutes) || body.heartbeatIntervalMinutes < 1 || body.heartbeatIntervalMinutes > 1440)) return NextResponse.json({ error: "heartbeat interval must be 1–1440 minutes" }, { status: 400 });
  let found = false;
  let updated: AgentItem | undefined;
  await mutateStore((s) => {
    const a = s.agents.find((x) => x.id === id);
    if (!a) return;
    found = true;
    for (const key of ["name", "platform", "role", "owner", "status", "url", "webhook"] as const) {
      if (body[key] != null) (a as Record<string, unknown>)[key] = String(body[key]).trim();
    }
    if (body.type != null && TYPES.includes(body.type)) a.type = body.type;
    if (body.parentId !== undefined) a.parentId = body.parentId ? String(body.parentId) : null;
    if (body.tags != null) {
      a.tags = Array.isArray(body.tags)
        ? body.tags.map(String)
        : String(body.tags)
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
    }
    if (body.personality != null) a.personality = String(body.personality).trim();
    if (body.instructions != null) a.instructions = String(body.instructions).trim();
    if (body.heartbeatIntervalMinutes != null) a.heartbeatIntervalMinutes = body.heartbeatIntervalMinutes;
    a.updatedAt = new Date().toISOString();
    updated = a;
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ agent: updated });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let found = false;
  let assigned = false;
  await mutateStore((s) => {
    if (s.tasks.some(t => t.assigneeId === id) || s.projects.some(p => p.leadAgentId === id || p.memberIds?.includes(id))) { assigned = true; return; }
    const before = s.agents.length;
    s.agents = s.agents.filter((a) => a.id !== id);
    for (const a of s.agents) if (a.parentId === id) a.parentId = null;
    found = s.agents.length < before;
  });
  if (assigned) return NextResponse.json({ error: "Unassign tasks and remove this agent from project teams before removing it" }, { status: 409 });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
