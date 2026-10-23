import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { AgentCard } from "@/components/agent-card";
import { Badge, Card, Empty, PageHeader, statusTone } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { agentHealth } from "@/lib/data/lifecycle";
import { TASK_LABELS, TASK_STATUSES } from "@/lib/data/types";
import { formatDateTime, formatDate, todayInTz } from "@/lib/time";
export const dynamic = "force-dynamic";
export default async function Overview() {
  const store = await getStore();
  const online = store.agents.filter(a => agentHealth(a, store.tasks).online).length;
  const active = store.tasks.filter(t => t.status === "doing");
  const blocked = store.tasks.filter(t => t.status === "blocked");
  const review = store.tasks.filter(t => t.status === "review");
  return <><LiveRefresh /><PageHeader title="Mission control" subtitle={`${formatDate(todayInTz())} · Your team’s work, at a glance.`}><Link href="/tasks#new-task" className="primary-button">＋ New task</Link></PageHeader>
    <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">{[
      { label: "Agents online", value: online, detail: `${store.agents.length} agents in your team`, href: "/bots", color: "text-emerald-600" },
      { label: "In progress", value: active.length, detail: "Tasks being worked on", href: "/tasks?status=doing", color: "text-indigo-600" },
      { label: "Needs attention", value: blocked.length, detail: "Blocked tasks to unblock", href: "/tasks?status=blocked", color: "text-rose-600" },
      { label: "Awaiting review", value: review.length, detail: "Deliverables ready for you", href: "/tasks?status=review", color: "text-amber-600" },
    ].map(m => <Link key={m.label} href={m.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{m.label}</p><p className={`my-2 text-4xl font-semibold tracking-tight ${m.color}`}>{m.value}</p><p className="text-xs text-slate-400">{m.detail}</p></Link>)}</div>
    <div className="mb-8 grid gap-6 xl:grid-cols-3"><div className="space-y-6 xl:col-span-2"><Card title="Work pipeline" action={<Link href="/tasks" className="text-sm text-indigo-600">Open board →</Link>}><div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{TASK_STATUSES.map(s => <Link href={`/tasks?status=${s}`} key={s} className="rounded-xl bg-slate-50 p-3"><p className="mb-2 text-2xl font-semibold">{store.tasks.filter(t => t.status === s).length}</p><Badge tone={statusTone(s)}>{TASK_LABELS[s]}</Badge></Link>)}</div></Card>
    <Card title="Your agents" action={<Link href="/bots" className="text-sm text-indigo-600">View team →</Link>}><div className="grid gap-3 md:grid-cols-2">{store.agents.slice(0, 4).map(a => <AgentCard key={a.id} agent={a} tasks={store.tasks} />)}</div>{!store.agents.length && <Empty>Your team starts here. Create an agent to assign your first task.</Empty>}</Card></div>
    <Card title="Needs your attention">{[...review, ...blocked].slice(0, 8).map(t => <Link key={t.id} href={`/tasks/${t.id}`} className="mb-3 block rounded-xl border border-slate-100 p-3 hover:bg-slate-50"><Badge tone={statusTone(t.status)}>{TASK_LABELS[t.status]}</Badge><p className="mt-2 text-sm font-medium">{t.title}</p><p className="mt-1 text-xs text-slate-500">{t.assigneeName || "Unassigned"} · {t.project || "No project"}</p></Link>)}{!review.length && !blocked.length && <Empty>You’re all caught up. No blocked tasks or pending reviews.</Empty>}</Card></div>
    <Card title="Live activity" action={<span className="text-xs text-slate-400">Updates every 30 seconds</span>}>{!store.activities.length && <Empty>Activity will appear when your agents check in.</Empty>}<div className="divide-y divide-slate-100">{store.activities.slice(0, 10).map(a => <div key={a.id} className="flex gap-3 py-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400" /><div className="min-w-0 flex-1"><p className="text-sm"><span className="font-semibold">{a.actor === "operator" ? "You" : store.agents.find(b => b.id === a.agentId)?.name || a.agentId}</span> <span className="text-slate-500">{a.kind.replaceAll("_", " ")}</span></p><p className="mt-1 break-words text-sm text-slate-600">{a.message}</p>{a.taskId && <Link href={`/tasks/${a.taskId}`} className="text-xs text-indigo-600">Open task →</Link>}</div><time className="shrink-0 text-xs text-slate-400">{formatDateTime(a.at)}</time></div>)}</div></Card>
  </>;
}
