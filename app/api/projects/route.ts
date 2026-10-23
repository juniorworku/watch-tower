import { NextResponse, type NextRequest } from "next/server";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import { LifecycleError } from "@/lib/data/lifecycle";
import { projectFor } from "@/lib/data/workflows";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ projects: (await loadStore()).projects }); }
async function save(req: NextRequest, create: boolean) {
  const b = await req.json().catch(() => ({}));
  const id = create ? newId("proj") : String(b.id || "");
  try {
    const store = await mutateStore(s => {
      const now = new Date().toISOString();
      const existing = s.projects.find(p => p.id === id);
      if (!create && !existing) throw new LifecycleError("project not found", 404);
      const name = String(b.name ?? existing?.name ?? "").trim();
      if (!name) throw new LifecycleError("project name required");
      if (s.projects.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) throw new LifecycleError("project name already exists", 409);
      const members = b.memberIds === undefined ? existing?.memberIds || [] : Array.isArray(b.memberIds) ? [...new Set(b.memberIds.map(String))] as string[] : [];
      const lead = b.leadAgentId === undefined ? existing?.leadAgentId || null : b.leadAgentId ? String(b.leadAgentId) : null;
      if (lead && !members.includes(lead)) members.push(lead);
      if (members.some(id => !s.agents.some(a => a.id === id))) throw new LifecycleError("team member not found");
      const tasks = existing ? s.tasks.filter(t => projectFor(s, t)?.id === id) : [];
      if (tasks.some(t => t.assigneeId && t.status !== "done" && !members.includes(t.assigneeId))) throw new LifecycleError("reassign open tasks before removing their agents from this project", 409);
      const project = existing || { id, name, owner: "", status: "active", archived: false, started: now.slice(0, 10), body: "", createdAt: now, updatedAt: now };
      Object.assign(project, { name, memberIds: members, leadAgentId: lead, updatedAt: now });
      for (const key of ["body", "owner", "status", "started"] as const) if (b[key] !== undefined) project[key] = String(b[key]);
      if (b.archived !== undefined) project.archived = b.archived === true;
      if (create) s.projects.unshift(project);
      for (const t of tasks) { t.projectId = id; t.project = name; }
    });
    return NextResponse.json({ project: store.projects.find(p => p.id === id) }, { status: create ? 201 : 200 });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
export async function POST(req: NextRequest) { return save(req, true); }
export async function PATCH(req: NextRequest) { return save(req, false); }
