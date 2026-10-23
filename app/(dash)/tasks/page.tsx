import Link from "next/link";
import { TaskCreateForm, TaskMoveButtons } from "@/components/forms";
import { Badge, Empty, PageHeader, statusTone } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { TASK_STATUSES } from "@/lib/data/types";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { todo: "Todo", doing: "Doing", blocked: "Blocked", done: "Done" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ owner?: string; project?: string }> }) {
  const sp = await searchParams;
  const store = await getStore();
  const all = store.tasks;
  const owners = [...new Set(all.flatMap((t) => t.owners))].sort();
  const projects = [...new Set(all.map((t) => t.project).filter(Boolean))].sort();
  const filtered = all.filter((t) => (!sp.owner || t.owners.includes(sp.owner)) && (!sp.project || t.project === sp.project));

  return (
    <>
      <PageHeader title="Tasks" subtitle="Kanban with live status changes. Stored in Vercel Blob.">
        <form className="flex flex-wrap gap-2 text-sm" method="get">
          <select name="owner" defaultValue={sp.owner || ""} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select name="project" defaultValue={sp.project || ""} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="rounded-lg bg-sky-500 px-3 py-1.5 font-medium text-slate-950">Filter</button>
          {(sp.owner || sp.project) && (
            <Link href="/tasks" className="px-2 py-1.5 text-slate-400 hover:text-white">Clear</Link>
          )}
        </form>
      </PageHeader>

      <TaskCreateForm owners={owners} projects={projects} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((s) => {
          const col = filtered.filter((t) => t.status === s);
          return (
            <div key={s} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <Badge tone={statusTone(s)}>{LABEL[s]}</Badge>
                <span className="text-xs text-slate-500">{col.length}</span>
              </div>
              <div className="space-y-3">
                {col.length === 0 && <p className="px-1 text-xs text-slate-600">No tasks</p>}
                {col.map((t) => (
                  <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="text-sm font-medium text-slate-100">{t.title}</div>
                    {t.body && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{t.body}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {t.owners.map((o) => (
                        <span key={o} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">@{o}</span>
                      ))}
                      {t.project && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300">{t.project}</span>}
                      {t.due && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">due {formatDate(t.due)}</span>}
                    </div>
                    <TaskMoveButtons id={t.id} status={t.status} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="mt-4"><Empty>No tasks match this filter.</Empty></div>}
    </>
  );
}
