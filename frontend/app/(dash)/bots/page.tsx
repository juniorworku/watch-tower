import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { AgentRegistryForm } from "@/components/forms";
import { AgentCard } from "@/components/agent-card";
import { Empty, PageHeader } from "@/components/ui";
import { agentHealth } from "@/lib/data/lifecycle";
import { getStore } from "@/lib/data/store";
export const metadata = { title: "Agents" };
export const dynamic = "force-dynamic";
export default async function BotsPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; create?: string; platform?: string }> }) {
  const { q = "", state = "", create = "", platform = "" } = await searchParams;
  const store = await getStore();
  const agents = store.agents.filter(a => `${a.name} ${a.role} ${a.platform} ${a.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()) && (!platform || a.platform === platform) && (!state || agentHealth(a, store.tasks).state === state));
  return <><LiveRefresh /><PageHeader title="Your agent team" subtitle={`${store.agents.length} agents. One place to see who’s working and what needs attention.`}><Link href="/bots?create=1#create-agent" className="primary-button">＋ Create agent</Link></PageHeader>
    <form className="mb-6 flex flex-wrap gap-3" method="get"><input aria-label="Search agents" name="q" defaultValue={q} placeholder="Search agents by name, role, or platform…" className="field min-w-48 flex-1" /><select aria-label="Agent state" className="field" name="state" defaultValue={state}><option value="">All states</option>{["working", "idle", "blocked", "offline"].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Agent platform" name="platform" defaultValue={platform} className="field"><option value="">All platforms</option>{Array.from(new Set(["Telegram", "WhatsApp", "Slack", ...store.agents.map(a => a.platform)])).map(p => <option key={p}>{p}</option>)}</select><button className="secondary-button">Search</button>{(q || state || platform) && <Link href="/bots" className="secondary-button">Clear</Link>}</form>
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{agents.map(a => <AgentCard key={a.id} agent={a} tasks={store.tasks} />)}</div>
    {!agents.length && <Empty>No agents found. Create your first agent below or adjust your search.</Empty>}
    <details open={create === "1"} id="create-agent" className="mt-8 scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold">Create an agent</summary><div className="mt-4"><AgentRegistryForm parents={store.agents.filter(a => a.type !== "sub-agent").map(a => ({ id: a.id, name: a.name }))} /></div></details>
  </>;
}
