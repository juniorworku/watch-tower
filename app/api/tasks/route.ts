import { NextResponse, type NextRequest } from "next/server";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import { assignTask, LifecycleError, reviewDeliverable, setTaskStatus } from "@/lib/data/lifecycle";
import { TASK_STATUSES, type TaskItem, type TaskStatus } from "@/lib/data/types";

export const runtime = "nodejs";

export async function GET() {
  const store = await loadStore();
  return NextResponse.json({ tasks: store.tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const status = "todo" as TaskStatus;
  const now = new Date().toISOString();
  const task: TaskItem = {
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
    lastStatusChangeAt: now,
    assigneeId: null,
    assignmentHistory: [],
    priority: ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal",
    source: "dashboard",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await mutateStore((s) => {
      if (body.assigneeId) assignTask(s, task, String(body.assigneeId), now);
      s.tasks.unshift(task);
    });
  } catch (error) {
    if (error instanceof LifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (body.status != null) {
    const st = String(body.status).toLowerCase();
    body.status = st;
    if (!TASK_STATUSES.includes(st as TaskStatus)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
  }
  let found = false;
  let updated;
  try { await mutateStore((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    found = true;
    if (body.title != null) t.title = String(body.title).trim() || t.title;
    const now = new Date().toISOString();
    if (body.action) {
      if (!["approve", "request_changes", "comment"].includes(body.action)) throw new LifecycleError("invalid action");
      const feedback = String(body.message || "").trim();
      if (body.action === "comment" && !feedback) throw new LifecycleError("comment required");
      if (body.action !== "comment") reviewDeliverable(t, body.action, feedback, now);
      s.activities.unshift({ id: newId("act"), agentId: t.assigneeId || "operator", actor: "operator", taskId: t.id,
        kind: body.action === "approve" ? "approved" : body.action === "request_changes" ? "changes_requested" : "comment",
        message: feedback || "Deliverable approved", at: now });
      t.updatedAt = now;
      updated = t;
      return;
    }
    if (body.priority != null) {
      if (!["low", "normal", "high", "urgent"].includes(body.priority)) throw new LifecycleError("invalid priority");
      t.priority = body.priority;
    }
    if (body.status && ["review", "done"].includes(body.status) && body.status !== t.status) throw new LifecycleError("Submit a deliverable and approve it to complete work", 409);
    if (t.status === "review" && ((body.status && body.status !== "review") || body.assigneeId !== undefined)) throw new LifecycleError("Review the pending deliverable before changing this task", 409);
    if (body.assigneeId !== undefined) assignTask(s, t, body.assigneeId ? String(body.assigneeId) : null, now);
    if (body.status === "assigned" && !t.assigneeId) throw new LifecycleError("Assign an agent before moving to Assigned", 409);
    if (body.status != null && t.status !== String(body.status).toLowerCase()) {
      setTaskStatus(t, String(body.status).toLowerCase() as TaskStatus, now);
      if (t.assigneeId) s.activities.unshift({ id: newId("act"), agentId: t.assigneeId, taskId: t.id, actor: "operator", kind: "status", message: `Dashboard changed status to ${t.status}`, at: now });
    }
    if (body.owners != null) t.owners = Array.isArray(body.owners) ? body.owners.map(String) : [];
    if (body.project != null) t.project = String(body.project).trim();
    if (body.due != null) t.due = String(body.due).trim();
    if (body.body != null) t.body = String(body.body);
    t.updatedAt = new Date().toISOString();
    updated = t;
  });
  } catch (error) {
    if (error instanceof LifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  if (!found) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task: updated });
}
