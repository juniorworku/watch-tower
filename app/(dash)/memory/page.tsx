import { LogCreateForm } from "@/components/forms";
import { Card, Empty, Markdown, PageHeader } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, TZ_LABEL } from "@/lib/time";
import { longTerm } from "@/lib/vault/queries";
import { getVault } from "@/lib/vault/source";

export const metadata = { title: "Memory" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const [store, vault] = await Promise.all([getStore(), getVault()]);
  const logs = [...store.logs].sort((a, b) => b.date.localeCompare(a.date));
  const lt = longTerm(vault);
  const agentNames = store.agents.map((a) => a.name);

  return (
    <>
      <PageHeader title="Memory" subtitle={`Daily logs (times in ${TZ_LABEL}) stored in Blob; long-term note from the vault.`} />
      <LogCreateForm agents={agentNames} />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Daily logs ({logs.length})</h2>
          {logs.length === 0 && <Empty>No daily logs yet.</Empty>}
          <ol className="relative space-y-6 border-l border-slate-800 pl-6">
            {logs.map((l) => (
              <li key={l.id} id={l.date}>
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-sky-400 ring-4 ring-slate-950" />
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-semibold text-white">{formatDate(l.date)}</span>
                  <span className="text-xs text-slate-500">{l.id}</span>
                </div>
                <Card>
                  <Markdown html={renderMarkdown(l.body.replace(/^#\s+.+$/m, ""), vault.notes)} className="prose-sm" />
                </Card>
              </li>
            ))}
          </ol>
        </div>
        <div className="xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Long-term memory</h2>
          {lt ? (
            <Card>
              <Markdown html={renderMarkdown(lt.body, vault.notes)} className="prose-sm" />
            </Card>
          ) : (
            <Empty>Memory/Long-term.md not found in vault.</Empty>
          )}
        </div>
      </div>
    </>
  );
}
