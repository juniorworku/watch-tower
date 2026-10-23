import Link from "next/link";
import { Card, Badge, Empty, PageHeader } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-controls";
import { getStore } from "@/lib/data/store";
import { projectFor } from "@/lib/data/workflows";
export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const store = await getStore();
  return <><PageHeader title="Projects & teams" subtitle="Shared context, specialist agents, and a lead to coordinate each project." />
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{store.projects.map(p => {
      const tasks = store.tasks.filter(t => projectFor(store, t)?.id === p.id);
      const done = tasks.filter(t => t.status === "done").length;
      return <Link key={p.id} href={`/projects/${p.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{p.name}</h2><Badge tone={p.archived ? "slate" : "green"}>{p.archived ? "Archived" : p.status}</Badge></div><p className="mt-3 text-sm text-slate-500">Lead: {store.agents.find(a => a.id === p.leadAgentId)?.name || "Not assigned"}</p><p className="mt-1 text-sm text-slate-500">{p.memberIds?.length || 0} members · {tasks.length} tasks · {done} done</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${tasks.length ? done / tasks.length * 100 : 0}%` }} /></div></Link>;
    })}</div>{!store.projects.length && <Empty>Create your first project to build a team.</Empty>}
    <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold text-indigo-600">＋ Create project</summary><div className="mt-5 max-w-2xl"><WorkflowForm url="/api/projects" label="Create project" fields={[{ name: "name", label: "Project name", required: true }, { name: "body", label: "Project docs & working guidelines", type: "textarea" }, { name: "memberIds", label: "Team members", type: "multi", options: store.agents.map(a => ({ value: a.id, label: a.name })) }, { name: "leadAgentId", label: "Lead agent", type: "select", options: [{ value: "", label: "No lead yet" }, ...store.agents.map(a => ({ value: a.id, label: a.name }))] }]} /></div></details>
  </>;
}
