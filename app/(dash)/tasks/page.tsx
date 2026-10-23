import { LiveRefresh } from "@/components/live-refresh";
import { TaskAssignment } from "@/components/task-assignment";
import Link from "next/link";
import { TaskCreateForm } from "@/components/forms";
import { Badge, Empty, PageHeader, statusTone } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { TASK_STATUSES, TASK_LABELS } from "@/lib/data/types";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

const LABEL = TASK_LABELS;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ owner?: string; project?: string; agent?: string; status?: string; create?: string }> }) {
  const sp = await searchParams;
  const store = await getStore();
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const all = [...store.tasks].sort((a, b) => rank[a.priority || "normal"] - rank[b.priority || "normal"]);
  const owners = [...new Set(all.flatMap((t) => t.owners).filter(Boolean))].sort();
  const projects = [...new Set(all.map((t) => t.project).filter(Boolean))].sort();
  const filtered = all.filter((t) => (!sp.agent || (sp.agent === "unassigned" ? !t.assigneeId : t.assigneeId === sp.agent)) && (!sp.status || t.status === sp.status) && (!sp.owner || t.owners.includes(sp.owner)) && (!sp.project || t.project === sp.project));

  return (
    <><LiveRefresh />
      <PageHeader title="Tasks" subtitle="Assign work, follow progress, and review what your team delivers.">
        <form className="flex flex-wrap gap-2 text-sm" method="get">
          <select aria-label="Filter by bot" name="agent" defaultValue={sp.agent || ""} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <option value="">All bots</option><option value="unassigned">Unassigned</option>
            {store.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Filter by status" name="status" defaultValue={sp.status || ""} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5"><option value="">All statuses</option>{TASK_STATUSES.map(s => <option key={s} value={s}>{LABEL[s]}</option>)}</select>
          <select name="owner" defaultValue={sp.owner || ""} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select name="project" defaultValue={sp.project || ""} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white">Filter</button>
          {(sp.owner || sp.project || sp.agent || sp.status) && (
            <Link href="/tasks" className="px-2 py-1.5 text-slate-500 hover:text-slate-900">Clear</Link>
          )}
        </form>
      </PageHeader>

      <details open={sp.create === "1"} id="new-task" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-indigo-600">＋ Create a task</summary><div className="mt-4"><TaskCreateForm owners={owners} projects={projects} agents={store.agents} /></div></details>

      <div className="overflow-x-auto pb-4"><div className="grid grid-cols-1 gap-4 md:min-w-[1680px] md:grid-cols-6">
        {TASK_STATUSES.map((s) => {
          const col = filtered.filter((t) => t.status === s);
          return (
            <div key={s} className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <Badge tone={statusTone(s)}>{LABEL[s]}</Badge>
                <span className="text-xs text-slate-500">{col.length}</span>
              </div>
              <div className="space-y-3">
                {col.length === 0 && <p className="px-1 text-xs text-slate-600">No tasks</p>}
                {col.map((t) => {
                  const taskOwners = [...new Set(t.owners.filter(Boolean))];
                  return (
                    <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-sm font-medium text-slate-900"><Link href={`/tasks/${t.id}`} className="hover:text-indigo-600">{t.title}</Link></div>
                      {t.body && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.body}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        {taskOwners.map((o) => (
                          <span key={`${t.id}-${o}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">@{o}</span>
                        ))}
                        {t.project && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700">{t.project}</span>}
                        {t.due && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700">due {formatDate(t.due)}</span>}
                      </div>
                      <TaskAssignment id={t.id} assigneeId={t.assigneeId} agents={store.agents} locked={t.status === "review"} />
                      <div className="mt-3 flex items-center justify-between"><Badge tone={t.priority === "urgent" || t.priority === "high" ? "amber" : "slate"}>{t.priority || "normal"}</Badge><Link href={`/tasks/${t.id}`} className="text-xs font-medium text-indigo-600">{t.status === "review" ? "Review output →" : "Open task →"}</Link></div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      {filtered.length === 0 && <div className="mt-4"><Empty>No tasks match this filter.</Empty></div>}
    </>
  );
}
