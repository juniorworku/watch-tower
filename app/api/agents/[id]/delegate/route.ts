import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAuth } from "@/lib/data/api-auth";
import { mutateStore, newId } from "@/lib/data/store";
import { instantiate, projectFor, validateLinks } from "@/lib/data/workflows";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const taskId = newId("task");
  try {
    const store = await mutateStore(s => {
      const parent = s.tasks.find(t => t.id === body.parentTaskId);
      if (!parent) throw new LifecycleError("parent task not found", 404);
      const project = projectFor(s, parent);
      if (!project || project.archived || project.leadAgentId !== id) throw new LifecycleError("only the project lead can delegate", 403);
      const task = instantiate(s, { title: String(body.title || ""), body: String(body.body || ""), projectId: project.id, priority: parent.priority || "normal", assigneeId: body.assigneeId || null }, new Date().toISOString(), "Lead delegation", taskId);
      task.parentTaskId = parent.id; validateLinks(s, task);
    });
    return NextResponse.json({ task: store.tasks.find(t => t.id === taskId) }, { status: 201 });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
