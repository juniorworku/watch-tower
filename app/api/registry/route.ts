import { NextResponse, type NextRequest } from "next/server";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import type { AgentItem, AgentType } from "@/lib/data/types";

export const runtime = "nodejs";
const TYPES: AgentType[] = ["bot", "agent", "sub-agent"];

export async function GET() {
  const store = await loadStore();
  return NextResponse.json({ agents: store.agents });
}

export async function POST(req: NextRequest) {
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
  await mutateStore((s) => {
    const before = s.agents.length;
    s.agents = s.agents.filter((a) => a.id !== id);
    for (const a of s.agents) if (a.parentId === id) a.parentId = null;
    found = s.agents.length < before;
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
