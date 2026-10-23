import { NextResponse, type NextRequest } from "next/server";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import { TASK_STATUSES, type TaskStatus } from "@/lib/data/types";

export const runtime = "nodejs";

export async function GET() {
  const store = await loadStore();
  return NextResponse.json({ tasks: store.tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const status = (TASK_STATUSES.includes(body.status) ? body.status : "todo") as TaskStatus;
  const now = new Date().toISOString();
  const task = {
    id: newId("task"),
    title,
    status,
    owners: Array.isArray(body.owners)
      ? body.owners.map(String)
      : String(body.owner || "")
          .split(/[,/]/)
          .map((s: string) => s.trim())
          .filter(Boolean),
    project: String(body.project || "").trim(),
    due: String(body.due || "").trim(),
    body: String(body.body || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  await mutateStore((s) => {
    s.tasks.unshift(task);
  });
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.status != null) {
    const st = String(body.status).toLowerCase();
    if (!TASK_STATUSES.includes(st as TaskStatus)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
  }
  let found = false;
  let updated;
  await mutateStore((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    found = true;
    if (body.title != null) t.title = String(body.title).trim() || t.title;
    if (body.status != null) t.status = String(body.status).toLowerCase() as TaskStatus;
    if (body.owners != null) t.owners = Array.isArray(body.owners) ? body.owners.map(String) : [];
    if (body.project != null) t.project = String(body.project).trim();
    if (body.due != null) t.due = String(body.due).trim();
    if (body.body != null) t.body = String(body.body);
    t.updatedAt = new Date().toISOString();
    updated = t;
  });
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task: updated });
}
