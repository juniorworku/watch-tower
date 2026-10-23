import type { AgentItem, ProjectItem, StoreData, TaskBlueprint, TaskItem, TaskTemplate, RecurringSchedule } from "./types";
import { assignTask, LifecycleError, reviewDeliverable, setTaskStatus } from "./lifecycle";

export function projectFor(store: StoreData, task: Pick<TaskItem, "projectId" | "project">) {
  return task.projectId ? store.projects.find(p => p.id === task.projectId) : store.projects.find(p => p.name.toLowerCase() === task.project.toLowerCase());
}
export function isMember(project: ProjectItem, id: string) {
  return project.leadAgentId === id || (project.memberIds || []).includes(id);
}
export function eligible(store: StoreData, task: TaskItem, agent: AgentItem) {
  const project = projectFor(store, task);
  if (task.projectId && !project) return false;
  if (project && (project.archived || !isMember(project, agent.id))) return false;
  if ((task.requiredTags || []).some(tag => !agent.tags?.includes(tag))) return false;
  return true;
}
export function ready(store: StoreData, task: TaskItem) {
  return (task.dependsOn || []).every(id => store.tasks.some(t => t.id === id && t.status === "done"));
}
export function ensureChildrenDone(store: StoreData, task: TaskItem) {
  if (store.tasks.some(t => t.parentTaskId === task.id && t.status !== "done")) throw new LifecycleError("Complete all subtasks before submitting or approving the parent", 409);
}
export function claimNext(store: StoreData, agentId: string, now: string) {
  const agent = store.agents.find(a => a.id === agentId);
  if (!agent) throw new LifecycleError("agent not found", 404);
  if (/paused|disabled/i.test(agent.status)) return null;
  const occupied = store.tasks.find(t => t.assigneeId === agentId && (t.status === "doing" || t.status === "blocked"));
  if (occupied) return occupied;
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const candidates = store.tasks.filter(t => !projectFor(store, t)?.archived && !store.tasks.some(child => child.parentTaskId === t.id && child.status !== "done") && ready(store, t) &&
    ((t.assigneeId === agentId && (t.status === "assigned" || t.status === "todo")) || (!t.assigneeId && t.status === "todo" && eligible(store, t, agent))));
  candidates.sort((a, b) => Number(b.assigneeId === agentId) - Number(a.assigneeId === agentId) || rank[a.priority || "normal"] - rank[b.priority || "normal"] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const task = candidates[0];
  if (!task) return null;
  if (!task.assigneeId) assignTask(store, task, agentId, now, "Automatic task pickup", "agent");
  setTaskStatus(task, "doing", now);
  task.claimedAt = now;
  store.activities.unshift({ id: `act-${crypto.randomUUID()}`, agentId, taskId: task.id, actor: "agent", kind: "claimed", message: `Picked up ${task.title}`, at: now });
  return task;
}
export function leadReview(store: StoreData, agentId: string, taskId: string, action: "approve" | "request_changes", message: string, now: string) {
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) throw new LifecycleError("task not found", 404);
  const project = projectFor(store, task);
  if (!project || project.archived || project.leadAgentId !== agentId || task.assigneeId === agentId) throw new LifecycleError("Only this project's lead can review another member's work", 403);
  if (action === "approve") ensureChildrenDone(store, task);
  reviewDeliverable(task, action, message, now);
  task.deliverables!.at(-1)!.reviewedBy = agentId;
  store.activities.unshift({ id: `act-${crypto.randomUUID()}`, agentId, taskId, kind: action === "approve" ? "approved" : "changes_requested", actor: "agent", message: message || "Lead approved deliverable", at: now });
  return task;
}

export function validateLinks(store: StoreData, task: TaskItem) {
  if (task.projectId && !store.projects.some(p => p.id === task.projectId && !p.archived)) throw new LifecycleError("active project not found");
  if (task.assigneeId) {
    const agent = store.agents.find(a => a.id === task.assigneeId);
    if (!agent) throw new LifecycleError("assignee not found");
    const p = projectFor(store, task);
    if (p && !isMember(p, agent.id)) throw new LifecycleError("assignee must be a project member");
  }
  if (store.tasks.some(child => child.parentTaskId === task.id && (projectFor(store, child)?.id || null) !== (projectFor(store, task)?.id || null))) throw new LifecycleError("parent and subtasks must stay in the same project");
  if (task.parentTaskId) {
    const parent = store.tasks.find(t => t.id === task.parentTaskId);
    if (!parent || parent.id === task.id) throw new LifecycleError("invalid parent task");
    if (["review", "done"].includes(parent.status)) throw new LifecycleError("reopen parent before adding subtasks", 409);
    if ((projectFor(store, parent)?.id || null) !== (projectFor(store, task)?.id || null)) throw new LifecycleError("subtasks must use the parent's project");
    let ancestor: TaskItem | undefined = parent;
    const seen = new Set([task.id]);
    while (ancestor) {
      if (seen.has(ancestor.id)) throw new LifecycleError("task hierarchy cannot contain cycles");
      seen.add(ancestor.id);
      ancestor = store.tasks.find(t => t.id === ancestor?.parentTaskId);
    }
  }
  const ancestors = new Set<string>();
  let ancestor = store.tasks.find(t => t.id === task.parentTaskId);
  while (ancestor && !ancestors.has(ancestor.id)) { ancestors.add(ancestor.id); ancestor = store.tasks.find(t => t.id === ancestor?.parentTaskId); }
  const visit = (id: string, seen: Set<string>) => {
    if (ancestors.has(id)) throw new LifecycleError("a subtask cannot depend on its parent");
    if (id === task.id || seen.has(id)) throw new LifecycleError("task dependencies cannot contain cycles");
    const dependency = store.tasks.find(t => t.id === id);
    if (!dependency) throw new LifecycleError("dependency not found");
    if ((projectFor(store, dependency)?.id || null) !== (projectFor(store, task)?.id || null)) throw new LifecycleError("dependencies must use the same project");
    for (const next of dependency.dependsOn || []) visit(next, new Set([...seen, id]));
  };
  for (const id of task.dependsOn || []) visit(id, new Set());
}
export function instantiate(store: StoreData, blueprint: TaskBlueprint, now: string, source: string, id = `task-${crypto.randomUUID()}`) {
  const project = blueprint.projectId ? store.projects.find(p => p.id === blueprint.projectId && !p.archived) : undefined;
  if (blueprint.projectId && !project) throw new LifecycleError("active project not found");
  const make = (data: { title: string; body: string; assigneeId?: string | null; requiredTags?: string[] }, taskId: string, parentTaskId?: string): TaskItem => {
    const task: TaskItem = { id: taskId, title: data.title.trim(), body: data.body || "", owners: [], due: "", status: "todo", project: project?.name || "", projectId: project?.id || null, parentTaskId, requiredTags: data.requiredTags || [], priority: blueprint.priority || "normal", source, createdAt: now, updatedAt: now, lastStatusChangeAt: now };
    if (!task.title) throw new LifecycleError("task title required");
    if (data.assigneeId) assignTask(store, task, data.assigneeId, now, source);
    validateLinks(store, task);
    store.tasks.unshift(task);
    return task;
  };
  const task = make(blueprint, id);
  for (const [index, sub] of (blueprint.subtasks || []).entries()) make(sub, `${id}-sub-${index}`, id);
  return task;
}
export function nextOccurrence(iso: string, cadence: RecurringSchedule["cadence"], anchorDay: number) {
  // Perform calendar arithmetic in EAT, including occurrences before 03:00.
  const next = new Date(Date.parse(iso) + 3 * 3600000);
  if (cadence === "monthly") {
    next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(anchorDay, last));
  } else next.setUTCDate(next.getUTCDate() + (cadence === "weekly" ? 7 : 1));
  return new Date(next.getTime() - 3 * 3600000).toISOString();
}
export function tickSchedules(store: StoreData, now: string) {
  let created = 0;
  const errors: string[] = [];
  for (const schedule of store.schedules || []) {
    if (!schedule.enabled) continue;
    const template = store.templates?.find(t => t.id === schedule.templateId);
    if (!template) { schedule.lastError = "Template missing"; errors.push(`${schedule.name}: template missing`); continue; }
    // Bound catch-up work; remaining occurrences are handled on the next tick.
    for (let i = 0; i < 30 && Date.parse(schedule.nextRunAt) <= Date.parse(now); i++) {
      const at = schedule.nextRunAt;
      const id = `recurring-${schedule.id}-${Date.parse(at)}`;
      try {
        if (!store.tasks.some(t => t.id === id)) {
          // Validate on a draft so an invalid subtask cannot leave half a template.
          const draft = structuredClone(store);
          const task = instantiate(draft, template.blueprint, now, `Schedule: ${schedule.name}`, id);
          task.scheduleId = schedule.id; task.scheduledFor = at;
          store.tasks = draft.tasks; store.activities = draft.activities; created++;
        }
      } catch (error) { schedule.lastError = (error as Error).message; errors.push(`${schedule.name}: ${schedule.lastError}`); break; }
      delete schedule.lastError;
      schedule.lastRunAt = at;
      schedule.nextRunAt = nextOccurrence(at, schedule.cadence, schedule.anchorDay);
    }
  }
  return { created, errors };
}
export function validateBlueprint(store: StoreData, blueprint: TaskBlueprint) {
  instantiate(structuredClone(store), blueprint, new Date().toISOString(), "Template validation");
}
export function templateFromTask(store: StoreData, taskId: string, name: string): TaskTemplate {
  const task = store.tasks.find(t => t.id === taskId);
  if (!task) throw new LifecycleError("task not found", 404);
  return { id: `template-${crypto.randomUUID()}`, name: name || task.title,
    blueprint: { title: task.title, body: task.body, priority: task.priority || "normal", projectId: projectFor(store, task)?.id || null, assigneeId: task.assigneeId, requiredTags: task.requiredTags,
      subtasks: store.tasks.filter(t => t.parentTaskId === task.id).map(t => ({ title: t.title, body: t.body, assigneeId: t.assigneeId, requiredTags: t.requiredTags })) }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export function parseBlueprint(input: unknown): TaskBlueprint {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new LifecycleError("template blueprint required");
  const b = input as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim() || !["low", "normal", "high", "urgent"].includes(String(b.priority))) throw new LifecycleError("template title and valid priority required");
  if (b.subtasks !== undefined && (!Array.isArray(b.subtasks) || b.subtasks.length > 50)) throw new LifecycleError("subtasks must be a list of up to 50 tasks");
  return { title: b.title.trim(), body: String(b.body || ""), priority: b.priority as TaskBlueprint["priority"], projectId: b.projectId ? String(b.projectId) : null, assigneeId: b.assigneeId ? String(b.assigneeId) : null,
    requiredTags: Array.isArray(b.requiredTags) ? b.requiredTags.map(String) : [],
    subtasks: ((b.subtasks || []) as unknown[]).map(sub => {
      if (!sub || typeof sub !== "object" || (typeof (sub as { title?: unknown }).title !== "string" || !String((sub as { title?: unknown }).title).trim())) throw new LifecycleError("each subtask needs a title");
      const t = sub as Record<string, unknown>;
      return { title: String(t.title).trim(), body: String(t.body || ""), assigneeId: t.assigneeId ? String(t.assigneeId) : null, requiredTags: Array.isArray(t.requiredTags) ? t.requiredTags.map(String) : [] };
    }) };
}
