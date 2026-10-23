import { NextResponse, type NextRequest } from "next/server";
import { getStore, mutateStore, newId } from "@/lib/data/store";

export const runtime = "nodejs";

export async function GET() {
  const store = await getStore();
  return NextResponse.json({ projects: store.projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const now = new Date().toISOString();
  const project = {
    id: newId("proj"),
    name,
    status: String(body.status || "active").trim(),
    archived: Boolean(body.archived),
    owner: String(body.owner || "").trim(),
    started: String(body.started || now.slice(0, 10)).trim(),
    body: String(body.body || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  await mutateStore((s) => {
    s.projects.unshift(project);
  });
  return NextResponse.json({ project }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let found = false;
  const store = await mutateStore((s) => {
    const p = s.projects.find((x) => x.id === id);
    if (!p) return;
    found = true;
    if (body.name != null) p.name = String(body.name).trim() || p.name;
    if (body.status != null) p.status = String(body.status).trim();
    if (body.archived != null) p.archived = Boolean(body.archived);
    if (body.owner != null) p.owner = String(body.owner).trim();
    if (body.started != null) p.started = String(body.started).trim();
    if (body.body != null) p.body = String(body.body);
    p.updatedAt = new Date().toISOString();
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project: store.projects.find((p) => p.id === id) });
}
