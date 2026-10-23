import type { ReactNode } from "react";
import { AgentDeleteButton, AgentRegistryForm } from "@/components/forms";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import type { AgentItem } from "@/lib/data/types";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Bots & Agents" };
export const dynamic = "force-dynamic";

function tone(status: string): "green" | "amber" | "red" | "slate" {
  const s = status.toLowerCase();
  if (s.includes("block") || s.includes("error") || s.includes("down")) return "red";
  if (s.includes("idle") || s.includes("paused")) return "amber";
  if (s.includes("active") || s.includes("online") || s.includes("working")) return "green";
  return "slate";
}

function hierarchy(agents: AgentItem[]) {
  const byParent = new Map<string | null, AgentItem[]>();
  for (const a of agents) {
    const k = a.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(a);
  }
  const roots = byParent.get(null) || [];
  // orphans whose parent is missing
  for (const a of agents) {
    if (a.parentId && !agents.some((p) => p.id === a.parentId) && !roots.includes(a)) roots.push(a);
  }
  return { roots, byParent };
}

function AgentCard({ a, depth }: { a: AgentItem; depth: number }) {
  return (
    <Card
      title={
        <span className="text-base normal-case tracking-normal text-white">
          {depth > 0 && <span className="mr-2 text-slate-600">{"└".padStart(depth, " ")}</span>}
          {a.name}
          <span className="ml-2 text-xs font-normal text-slate-500">{a.type} · {a.platform}</span>
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          <Badge tone={tone(a.status)}>{a.status}</Badge>
          <AgentDeleteButton id={a.id} name={a.name} />
        </div>
      }
    >
      <p className="text-sm text-slate-300">{a.role || "No role set."}</p>
      <p className="mt-1 text-xs text-slate-500">
        Owner: {a.owner || "—"} · Id: <code className="text-slate-400">{a.id}</code>
        {a.parentId && <> · Parent: <code className="text-slate-400">{a.parentId}</code></>}
      </p>
      {(a.url || a.webhook) && (
        <p className="mt-2 text-xs text-slate-400">
          {a.url && (<a className="text-sky-300 hover:underline" href={a.url} target="_blank" rel="noreferrer">Open link</a>)}
          {a.url && a.webhook && " · "}
          {a.webhook && <span>Webhook: <code>{a.webhook}</code></span>}
        </p>
      )}
      {a.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.tags.map((t) => (
            <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">{t}</span>
          ))}
        </div>
      )}
      <div className="mt-3 grid gap-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <div>Last heartbeat: {a.lastHeartbeat ? formatDateTime(a.lastHeartbeat) : "—"}</div>
        <div>Last activity: {a.lastActivity ? `${formatDateTime(a.lastActivity)} — ${a.lastActivityText || ""}` : "—"}</div>
      </div>
    </Card>
  );
}

export default async function BotsPage() {
  const store = await getStore();
  const agents = store.agents;
  const { roots, byParent } = hierarchy(agents);
  const parents = agents.filter((a) => a.type !== "sub-agent").map((a) => ({ id: a.id, name: a.name }));

  function renderTree(list: AgentItem[], depth: number): ReactNode[] {
    return list.flatMap((a) => [
      <AgentCard key={a.id} a={a} depth={depth} />,
      ...renderTree(byParent.get(a.id) || [], depth + 1),
    ]);
  }

  return (
    <>
      <PageHeader title="Bots & Agents" subtitle={`${agents.length} registered. Add bots, agents, and sub-agents from any platform. Hierarchy is by parent agent.`} />
      <AgentRegistryForm parents={parents} />
      <div className="grid gap-4 xl:grid-cols-2">{renderTree(roots, 0)}</div>
    </>
  );
}
