import Link from "next/link";
import { Badge, Card, Empty, HealthBadge, Markdown, PageHeader, statusTone } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { TASK_STATUSES } from "@/lib/data/types";
import { allHealth, googleCalendar } from "@/lib/integrations";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, formatDateTime, todayInTz, TZ_LABEL } from "@/lib/time";
import { getVault } from "@/lib/vault/source";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [store, vault, health, cal] = await Promise.all([getStore(), getVault(), allHealth(), googleCalendar.fetch()]);
  const ts = store.tasks;
  const bots = store.agents.filter((a) => !a.parentId || a.type !== "sub-agent");
  const logs = [...store.logs].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayInTz();
  const todayLog = logs.find((l) => l.date === today);
  const shownLog = todayLog || logs[0];
  const blocked = ts.filter((t) => t.status === "blocked");
  const counts = TASK_STATUSES.map((s) => ({ s, n: ts.filter((t) => t.status === s).length }));
  const summary = shownLog ? (shownLog.body.match(/##\s+Summary\n([\s\S]*?)(?=\n## |\n### |$)/i)?.[1] || shownLog.body).slice(0, 800) : "";

  return (
    <>
      <PageHeader title="Overview" subtitle={`Today is ${formatDate(today)} (${TZ_LABEL}). Live data from Blob + connected integrations.`} />

      <div className="grid gap-4 md:grid-cols-3">
        {bots.slice(0, 9).map((b) => {
          const children = store.agents.filter((c) => c.parentId === b.id);
          return (
            <Link key={b.id} href="/bots" className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-5 hover:border-sky-500/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white group-hover:text-sky-200">{b.name}</h3>
                  <p className="text-sm text-slate-400">{b.role || b.platform}</p>
                </div>
                <Badge tone={b.status.toLowerCase().includes("block") ? "red" : "green"}>{b.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">{b.type} · {b.platform}{children.length ? ` · ${children.length} sub-agent(s)` : ""}</p>
              <div className="mt-3 border-t border-slate-800 pt-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">Last activity</div>
                {b.lastActivityText ? (
                  <p className="mt-1 line-clamp-3 text-slate-300">
                    <span className="text-slate-500">{b.lastActivity ? formatDateTime(b.lastActivity) : ""}:</span> {b.lastActivityText}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-500">No activity yet.</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Tasks by status" action={<Link href="/tasks" className="text-xs text-sky-300">Board →</Link>}>
          <div className="grid grid-cols-4 gap-2">
            {counts.map(({ s, n }) => (
              <Link key={s} href="/tasks" className="rounded-xl bg-slate-950/60 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{n}</div>
                <Badge tone={statusTone(s)}>{s}</Badge>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">{ts.length} tasks in store.</p>
        </Card>

        <Card title={`Blocked (${blocked.length})`}>
          {blocked.length === 0 ? (
            <Empty>Nothing blocked.</Empty>
          ) : (
            <ul className="space-y-3">
              {blocked.map((t) => (
                <li key={t.id} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  <Link href="/tasks" className="font-medium text-rose-200 hover:underline">{t.title}</Link>
                  <p className="mt-1 text-sm text-slate-400">{t.body || "No notes."}</p>
                  <p className="mt-1 text-xs text-slate-500">Owner: {t.owners.join(", ") || "—"} · Project: {t.project || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming calendar slot">
          {cal.ok ? (
            cal.data.length === 0 ? (
              <Empty>No upcoming events.</Empty>
            ) : (
              <ul className="space-y-2">
                {cal.data.slice(0, 3).map((e, i) => (
                  <li key={e.id} className={i === 0 ? "rounded-lg bg-sky-500/10 p-3" : "px-3"}>
                    <div className={i === 0 ? "font-medium text-white" : "text-sm text-slate-300"}>{e.summary}</div>
                    <div className="text-xs text-slate-400">{e.allDay ? `${formatDate(e.start)} (all day)` : formatDateTime(e.start)}</div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="text-sm text-slate-400">
              <HealthBadge status={cal.reason === "error" ? "error" : "not_configured"} />
              <p className="mt-2">{cal.reason === "error" ? cal.message : "Google Calendar is not connected, so no calendar data is shown."}</p>
              <Link href="/integrations#google-calendar" className="mt-2 inline-block text-xs text-sky-300">Setup steps →</Link>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={shownLog ? (todayLog ? `Today's log · ${shownLog.date}` : `Latest log · ${shownLog.date}`) : "Today's log"}
          action={<Link href="/memory" className="text-xs text-sky-300">Memory →</Link>}
        >
          {shownLog ? <Markdown html={renderMarkdown(summary, vault.notes)} className="prose-sm" /> : <Empty>No daily logs yet.</Empty>}
        </Card>
        <Card title="Integration health" action={<Link href="/integrations" className="text-xs text-sky-300">Details →</Link>}>
          <ul className="space-y-2">
            {health.map(({ adapter, health: h }) => (
              <li key={adapter.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/integrations#${adapter.id}`} className="text-slate-300 hover:text-white">{adapter.name}</Link>
                <HealthBadge status={h.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
