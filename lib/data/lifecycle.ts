import type { AgentItem, StoreData, TaskItem, TaskStatus } from "./types";

export class LifecycleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function setTaskStatus(task: TaskItem, status: TaskStatus, now: string) {
  if (task.status !== status) task.lastStatusChangeAt = now;
  task.status = status;
  task.updatedAt = now;
}

export function assignTask(store: StoreData, task: TaskItem, assigneeId: string | null, now: string, reason = "Dashboard assignment") {
  const agent = assigneeId ? store.agents.find(a => a.id === assigneeId) : null;
  if (assigneeId && !agent) throw new LifecycleError("assignee not found");
  const previous = task.assigneeId || null;
  if (previous === assigneeId) return;
  task.assigneeId = assigneeId;
  task.assigneeName = agent?.name || null;
  task.currentRunId = null;
  (task.assignmentHistory ||= []).push({ fromId: previous, toId: assigneeId, at: now, reason });
  setTaskStatus(task, assigneeId ? "assigned" : "todo", now);
  store.activities.unshift({ id: `act-${crypto.randomUUID()}`, agentId: assigneeId || previous!, taskId: task.id,
    kind: previous ? "re-assigned" : "assigned", message: `${reason}: ${agent?.name || "unassigned"}`, at: now });
}

export function agentHealth(agent: AgentItem, tasks: TaskItem[], now = Date.now()) {
  const times = [agent.lastHeartbeat, agent.lastActivity].filter(Boolean).map(t => Date.parse(t!)).filter(Number.isFinite);
  const lastSeenAt = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const online = lastSeenAt !== null && now - Date.parse(lastSeenAt) <= (agent.heartbeatIntervalMinutes || 15) * 2 * 60 * 1000;
  const assigned = tasks.filter(t => t.assigneeId === agent.id);
  const active = assigned.filter(t => t.status === "doing");
  const blocked = assigned.filter(t => t.status === "blocked");
  return { lastSeenAt, online, active, blocked, assigned,
    state: !online ? "offline" : blocked.length ? "blocked" : active.length ? "working" : "idle" };
}

export function submitDeliverable(task: TaskItem, agentId: string, input: { title?: unknown; content?: unknown; url?: unknown }, now: string) {
  if (task.assigneeId !== agentId) throw new LifecycleError("task is not assigned to this agent", 409);
  if (task.status === "done" || task.status === "review") throw new LifecycleError("task is already completed or awaiting review", 409);
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  const url = String(input.url || "").trim();
  if (!title || !content) throw new LifecycleError("deliverable title and content required");
  if (url) {
    try { if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error(); }
    catch { throw new LifecycleError("deliverable URL must use http or https"); }
  }
  (task.deliverables ||= []).push({ id: `output-${crypto.randomUUID()}`, agentId, title, content, url: url || undefined, submittedAt: now, review: "pending" });
  setTaskStatus(task, "review", now);
}

export function reviewDeliverable(task: TaskItem, decision: "approve" | "request_changes", feedback: string, now: string) {
  const latest = task.deliverables?.at(-1);
  if (task.status !== "review" || !latest || latest.review !== "pending") throw new LifecycleError("no pending deliverable to review", 409);
  if (decision === "request_changes" && !feedback.trim()) throw new LifecycleError("feedback required when requesting changes");
  latest.review = decision === "approve" ? "approved" : "changes_requested";
  latest.feedback = feedback.trim();
  latest.reviewedAt = now;
  setTaskStatus(task, decision === "approve" ? "done" : "doing", now);
}
