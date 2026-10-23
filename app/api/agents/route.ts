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
  return NextResponse.json({ agents: store.agents, activities: store.activities.slice(0, 50) });
}

export async function POST(req: NextRequest) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
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
  await mutateStore((s) => {
    const before = s.agents.length;
    s.agents = s.agents.filter((a) => a.id !== id);
    for (const a of s.agents) if (a.parentId === id) a.parentId = null;
    found = s.agents.length < before;
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
