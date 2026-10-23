import { Card, HealthBadge, PageHeader } from "@/components/ui";
import { allHealth, gmail, notion, slackAdapter } from "@/lib/integrations";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const [health, gm, no, sl] = await Promise.all([allHealth(), gmail.fetch(), notion.fetch(), slackAdapter.fetch()]);
  const live: Record<string, React.ReactNode> = {
    gmail: gm.ok ? <p>{gm.data.email}: <b>{gm.data.inboxUnread}</b> unread of {gm.data.inboxTotal} in Inbox (fetched {formatDateTime(gm.fetchedAt)}).</p> : null,
    notion: no.ok ? (
      <div>
        <p className="mb-1">Latest reading log entries ({no.data.kind}):</p>
        <ul className="list-disc pl-5">{no.data.items.map((i) => <li key={i.id}>{i.url ? <a className="text-indigo-600" href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title} <span className="text-slate-500">· {formatDateTime(i.lastEdited)}</span></li>)}</ul>
      </div>
    ) : null,
    slack: sl.ok && sl.data.channel ? (
      <div>
        <p className="mb-1">Latest in channel {sl.data.channel.id}:</p>
        <ul className="list-disc pl-5">{sl.data.channel.recent.map((m) => <li key={m.ts}>{m.text || "(no text)"} <span className="text-slate-500">· {formatDateTime(new Date(Number(m.ts) * 1000))}</span></li>)}</ul>
      </div>
    ) : null,
  };
  return (
    <>
      <PageHeader title="Integrations" subtitle="Read-only integrations managed by FastAPI. Configure provider credentials in the backend environment." />
      <div className="space-y-4">
        {health.map(({ adapter: a, health: h }) => (
          <Card key={a.id} className="scroll-mt-6" title={<span id={a.id} className="text-base normal-case tracking-normal text-slate-900">{a.name}</span>} action={<HealthBadge status={h.status} />}>
            <p className="text-sm text-slate-700">{a.purpose}</p>
            <p className={`mt-2 text-sm ${h.status === "error" ? "text-rose-700" : "text-slate-500"}`}>{h.detail} <span className="text-xs text-slate-600">(checked {formatDateTime(h.checkedAt)})</span></p>
            {live[a.id] && <div className="mt-3 rounded-lg bg-white/60 p-3 text-sm text-slate-700">{live[a.id]}</div>}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Environment variables</h3>
                <table className="w-full text-left text-sm">
                  <tbody>
                    {a.envVars.map((e) => (
                      <tr key={e.name} className="border-t border-slate-200 align-top">
                        <td className="py-1.5 pr-3"><code className="text-amber-700">{e.name}</code>{e.required ? <span className="ml-1 text-xs text-rose-700">required</span> : <span className="ml-1 text-xs text-slate-500">optional</span>}</td>
                        <td className="py-1.5 text-slate-500">{e.description} {e.configured ? <span className="text-emerald-400">(set)</span> : <span className="text-slate-600">(not set)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details open={h.status !== "connected" && h.status !== "snapshot"}>
                <summary className="mb-2 cursor-pointer text-xs uppercase tracking-wide text-slate-500">Setup steps</summary>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-500">{a.setupSteps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </details>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
