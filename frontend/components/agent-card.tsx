import Link from "next/link";
import { Badge, type Tone } from "@/components/ui";
import { agentHealth } from "@/lib/data/lifecycle";
import type { AgentItem, TaskItem } from "@/lib/data/types";
import { formatDateTime } from "@/lib/time";
const tones: Record<string, Tone> = { working: "green", blocked: "red", idle: "amber", offline: "slate" };
export function AgentCard({ agent, tasks }: { agent: AgentItem; tasks: TaskItem[] }) {
  const h = agentHealth(agent, tasks);
  const current = h.active[0] || h.blocked[0];
  return <Link href={`/bots/${agent.id}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
    <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">{agent.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="truncate font-semibold text-slate-900">{agent.name}</h2><Badge tone={tones[h.state]}>● {h.state}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{agent.role || agent.platform}</p></div></div>
    <div className="mt-5 rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current work</p><p className="mt-1 truncate text-sm text-slate-700">{current?.title || (h.assigned.some(t => t.status === "review") ? "Deliverable awaiting review" : "Ready for the next assignment")}</p></div>
    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{h.assigned.filter(t => t.status !== "done").length} open · {h.blocked.length} blocked</span><span title={formatDateTime(h.lastSeenAt)}>{h.lastSeenAt ? `Seen ${formatDateTime(h.lastSeenAt)}` : "Not connected"}</span></div>
  </Link>;
}
