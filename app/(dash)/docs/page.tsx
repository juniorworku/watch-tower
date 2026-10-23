import Link from "next/link";
import { Card, Empty, Markdown, PageHeader } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";
import { noteHref } from "@/lib/vault/links";
import { agents, changelog, runbooks, runs } from "@/lib/vault/queries";
import { getVault } from "@/lib/vault/source";
import type { Note } from "@/lib/vault/types";

export const metadata = { title: "Docs" };

function NoteList({ notes, empty }: { notes: Note[]; empty: string }) {
  if (!notes.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-slate-800">
      {notes.map((n) => (
        <li key={n.path} className="py-2">
          <Link href={noteHref(n.path)} className="text-slate-200 hover:text-sky-200">{n.title}</Link>
          <div className="text-xs text-slate-500">{n.path}</div>
        </li>
      ))}
    </ul>
  );
}

export default async function DocsPage() {
  const vault = await getVault();
  const cl = changelog(vault);
  const runNotes = runs(vault);
  const runWriteups = runNotes.filter((n) => !/readme/i.test(n.name));
  const runsReadme = runNotes.find((n) => /readme/i.test(n.name));
  return (
    <>
      <PageHeader title="Docs" subtitle="Agent profiles, runbooks, changelog and run write-ups from Docs/." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Agent profiles (vault)"><NoteList notes={agents(vault).map((a) => a.note)} empty="No agent profiles." /></Card>
        <Card title="Runbooks"><NoteList notes={runbooks(vault)} empty="No runbooks." /></Card>
        <Card title={`Run write-ups (${runWriteups.length})`}>
          <NoteList notes={runWriteups} empty="No runs recorded yet." />
          {runsReadme && (
            <p className="mt-3 text-xs text-slate-500">
              How runs are recorded: <Link className="text-sky-300" href={noteHref(runsReadme.path)}>{runsReadme.title}</Link>
            </p>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Changelog" action={cl && <Link href={noteHref(cl.path)} className="text-xs text-sky-300">Open →</Link>}>
          {cl ? <Markdown html={renderMarkdown(cl.body.replace(/^#\s+.+$/m, ""), vault.notes)} className="prose-sm" /> : <Empty>Docs/Changelog.md not found.</Empty>}
        </Card>
      </div>
    </>
  );
}
