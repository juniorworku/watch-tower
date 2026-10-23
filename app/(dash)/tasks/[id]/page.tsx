import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/data/store";
import { Badge, Empty, PageHeader, Card, statusTone } from "@/components/ui";
import { TaskAssignment } from "@/components/task-assignment";
import { TaskMoveButtons } from "@/components/forms";
import { ReviewForm, TaskEditForm } from "@/components/operations-forms";
import { TASK_LABELS } from "@/lib/data/types";
import { formatDateTime } from "@/lib/time";
export const dynamic = "force-dynamic";
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const task = store.tasks.find(t => t.id === id);
  if (!task) notFound();
  const name = (id: string | null) => store.agents.find(a => a.id === id)?.name || id || "Unassigned";
  const activities = store.activities.filter(a => a.taskId === id);
  return <><LiveRefresh /><Link href="/tasks" className="mb-5 inline-block text-sm text-indigo-600">← Task board</Link>
    <PageHeader title={task.title} subtitle={`${task.project || "No project"} · Created ${formatDateTime(task.createdAt)}`}><Badge tone={statusTone(task.status)}>{TASK_LABELS[task.status]}</Badge></PageHeader>
    <div className="grid items-start gap-6 xl:grid-cols-3"><div className="space-y-6 xl:col-span-2">
      <Card title="Brief"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{task.body || "No description yet. Add the expected outcome in task settings."}</p></Card>
      <Card title={`Deliverables · ${task.deliverables?.length || 0}`}>
        {!task.deliverables?.length && <Empty>The assigned agent’s submitted work will appear here for review.</Empty>}
        <div className="space-y-4">{[...(task.deliverables || [])].reverse().map((d, i) => <article key={d.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{d.title}</h3><Badge tone={d.review === "approved" ? "green" : d.review === "pending" ? "amber" : "red"}>{d.review.replaceAll("_", " ")}</Badge></div><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{d.content}</p>{d.url && /^https?:\/\//i.test(d.url) && <a className="mt-3 inline-block text-sm text-indigo-600" href={d.url} target="_blank" rel="noreferrer">Open submitted artifact ↗</a>}<p className="mt-3 text-xs text-slate-400">Revision {(task.deliverables?.length || 0) - i} · {name(d.agentId)} · {formatDateTime(d.submittedAt)}</p>{d.feedback && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p className="mb-1 font-medium">Review feedback</p><p className="whitespace-pre-wrap">{d.feedback}</p></div>}</article>)}</div>
        <div className="mt-5 border-t border-slate-100 pt-5"><ReviewForm task={task} /></div>
      </Card>
      <Card title="Activity thread">{!activities.length && <Empty>No task updates yet.</Empty>}<div className="space-y-4">{activities.map(a => <div key={a.id} className="border-l-2 border-indigo-100 pl-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span className="font-medium">{a.actor === "operator" ? "You" : name(a.agentId)} · {a.kind.replaceAll("_", " ")}</span><time>{formatDateTime(a.at)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{a.message}</p></div>)}</div></Card>
    </div><div className="space-y-6"><Card title="Task management"><div className="space-y-4 text-sm"><p>Owners: {task.owners.join(", ") || "—"}</p><TaskAssignment id={id} assigneeId={task.assigneeId} agents={store.agents} /><TaskMoveButtons id={id} status={task.status} /><p className="text-xs text-slate-400">Updated {formatDateTime(task.updatedAt)}</p></div></Card>
      <Card title="Task settings"><TaskEditForm task={task} /></Card>
      <Card title="Assignment history">{!task.assignmentHistory?.length && <p className="text-sm text-slate-500">No assignments yet.</p>}<div className="space-y-4">{[...(task.assignmentHistory || [])].reverse().map((h, i) => <div key={i} className="text-xs"><p className="font-medium">{name(h.fromId)} → {name(h.toId)}</p><p className="mt-1 text-slate-500">{formatDateTime(h.at)}</p><p className="mt-1 text-slate-500">{h.reason}</p></div>)}</div></Card>
    </div></div>
  </>;
}
