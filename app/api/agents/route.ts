import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/data/api-auth";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import type { AgentItem, AgentType } from "@/lib/data/types";

export const runtime = "nodejs";

const TYPES: AgentType[] = ["bot", "agent", "sub-agent"];

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const store = await loadStore();
  return NextResponse.json({ agents: store.agents.map(({ credentialHash: _hash, ...a }) => a), activities: store.activities.slice(0, 50) });
}

export async function POST(req: NextRequest) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
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
  const id = String(body.id || "").trim() || newId("agent");
  let saved: AgentItem | undefined;
  await mutateStore((s) => {
    const idx = s.agents.findIndex((a) => a.id === id);
    const base: AgentItem = {
      id,
      name,
      platform: String(body.platform || "custom").trim(),
      type,
      parentId,
      role: String(body.role || "").trim(),
      owner: String(body.owner || "").trim(),
      status: String(body.status || "active").trim(),
      url: String(body.url || "").trim(),
      webhook: String(body.webhook || body.endpoint || "").trim(),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      createdAt: now,
      updatedAt: now,
      personality: String(body.personality || "").trim(),
    instructions: String(body.instructions || "").trim(),
      heartbeatIntervalMinutes: body.heartbeatIntervalMinutes || 15,
      lastHeartbeat: null,
      lastActivity: null,
      lastActivityText: null,
    };
    if (idx >= 0) {
      const prev = s.agents[idx];
      s.agents[idx] = {
        ...prev,
        ...base,
        createdAt: prev.createdAt,
        personality: body.personality === undefined ? prev.personality : base.personality,
        instructions: body.instructions === undefined ? prev.instructions : base.instructions,
        heartbeatIntervalMinutes: body.heartbeatIntervalMinutes === undefined ? prev.heartbeatIntervalMinutes : base.heartbeatIntervalMinutes,
        lastHeartbeat: prev.lastHeartbeat,
        lastActivity: prev.lastActivity,
        lastActivityText: prev.lastActivityText,
        updatedAt: now,
      };
      saved = s.agents[idx];
    } else {
      s.agents.push(base);
      saved = base;
    }
  });
  return NextResponse.json({ agent: saved }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || req.nextUrl.searchParams.get("id") || "").trim();
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
