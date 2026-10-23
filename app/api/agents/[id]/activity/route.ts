import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAuth } from "@/lib/data/api-auth";
import { mutateStore, newId } from "@/lib/data/store";
import { assignTask, LifecycleError, setTaskStatus, submitDeliverable } from "@/lib/data/lifecycle";
import { claimNext, ensureChildrenDone, ready, tickSchedules } from "@/lib/data/workflows";
import type { ActivityItem, TaskStatus } from "@/lib/data/types";

export const runtime = "nodejs";
const kinds = ["heartbeat", "activity", "status", "accepted", "rejected", "started", "progress", "blocked", "completed", "failed", "submitted"] as const;
const states: Record<string, TaskStatus> = { accepted: "assigned", started: "doing", blocked: "blocked", failed: "blocked" };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const kind = body.kind || "activity";
  if (!kinds.includes(kind)) return NextResponse.json({ error: "invalid event kind; assignments are managed through the task board" }, { status: 400 });
  const taskId = body.taskId ? String(body.taskId) : undefined;
  if (!["heartbeat", "activity", "status"].includes(kind) && !taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  const message = String(body.message || body.text || (kind === "heartbeat" ? "heartbeat" : "")).trim();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
  let activity: ActivityItem | undefined;
  try {
    await mutateStore(s => {
      const agent = s.agents.find(a => a.id === id);
      if (!agent) throw new LifecycleError("agent not found", 404);
      const task = taskId ? s.tasks.find(t => t.id === taskId) : undefined;
      if (taskId && !task) throw new LifecycleError("task not found", 404);
      if (task && task.assigneeId !== id) throw new LifecycleError("task is not assigned to this agent", 409);
      if (task?.status === "done" && kind !== "heartbeat" && kind !== "activity") throw new LifecycleError("completed task must be reopened on the board", 409);
      const now = new Date().toISOString();
      if (task) {
        if (["started", "accepted"].includes(kind)) {
          if (!ready(s, task)) throw new LifecycleError("task dependencies are not complete", 409);
          if (kind === "started" && s.tasks.some(t => t.id !== task.id && t.assigneeId === id && ["doing", "blocked"].includes(t.status))) throw new LifecycleError("agent already has active work", 409);
        }
        if (kind === "completed" || kind === "submitted") {
          if (!ready(s, task)) throw new LifecycleError("task dependencies are not complete", 409);
          ensureChildrenDone(s, task);
        }
        if (task.status === "review" && !["heartbeat", "activity", "status"].includes(kind)) throw new LifecycleError("task is awaiting operator review", 409);
        if (kind === "completed" || kind === "submitted") submitDeliverable(task, id, body.deliverable || {}, now);
        if (kind === "rejected") assignTask(s, task, null, now, message, "agent");
        else if (states[kind]) setTaskStatus(task, states[kind], now);
        if (kind !== "rejected" && body.currentRunId) task.currentRunId = String(body.currentRunId);
        task.updatedAt = now;
      }
      activity = { id: newId("act"), agentId: id, taskId, kind: kind === "completed" ? "submitted" : kind, actor: "agent", message, at: now,
        meta: { ...(typeof body.meta === "object" && body.meta && !Array.isArray(body.meta) ? body.meta : {}), reportedStatus: body.status || (s.tasks.some(t => t.assigneeId === id && t.status === "blocked") ? "blocked" : s.tasks.some(t => t.assigneeId === id && t.status === "doing") ? "working" : "idle"), taskStatus: task?.status } };
      s.activities.unshift(activity!);

      if (kind === "heartbeat") agent.lastHeartbeat = now;
      agent.lastActivity = now;
      agent.lastActivityText = message.slice(0, 280);
      if (body.status) agent.status = String(body.status).trim();
      agent.updatedAt = now;
      if (kind === "heartbeat") { tickSchedules(s, now); if (body.pickup === true) claimNext(s, id, now); }
    });
  } catch (error) {
    if (error instanceof LifecycleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ activity }, { status: 201 });
}
