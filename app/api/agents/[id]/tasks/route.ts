import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAuth } from "@/lib/data/api-auth";
import { loadStore, mutateStore } from "@/lib/data/store";
import { claimNext, isMember, projectFor, tickSchedules } from "@/lib/data/workflows";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const store = await loadStore();
  const agent = store.agents.find(a => a.id === id);
  if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
  const projects = store.projects.filter(p => isMember(p, id));
  const visible = store.tasks.filter(t => t.assigneeId === id || projects.some(p => p.id === projectFor(store, t)?.id));
  const ids = new Set(visible.map(t => t.id));
  return NextResponse.json({ instructions: agent.instructions || "", personality: agent.personality || "", heartbeatIntervalMinutes: agent.heartbeatIntervalMinutes || 15,
    tasks: visible.filter(t => t.assigneeId === id), projectTasks: visible, projects, activities: store.activities.filter(a => a.taskId && ids.has(a.taskId)).slice(0, 200) });
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let taskId: string | undefined;
  try {
    const store = await mutateStore(s => {
      const now = new Date().toISOString(); tickSchedules(s, now);
      taskId = claimNext(s, id, now)?.id;
    });
    return NextResponse.json({ task: store.tasks.find(t => t.id === taskId) || null });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
