import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Markdown, PageHeader } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";
import { str } from "@/lib/vault/parse";
import { findNoteByPath } from "@/lib/vault/queries";
import { getVault } from "@/lib/vault/source";
import { noteHref } from "@/lib/vault/links";

export default async function NotePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.map((s) => decodeURIComponent(s)).join("/");
  const vault = await getVault();
  const note = findNoteByPath(vault, path);
  if (!note) notFound();
  const fm = Object.entries(note.frontmatter);
  const isBoard = str(note.frontmatter["kanban-plugin"]) === "board";
  const backlinks = vault.notes.filter((n) => n.path !== note.path && new RegExp(`\\[\\[(?:[^\\]|#]*/)?${note.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[#|][^\\]]*)?\\]\\]`, "i").test(n.body));
  const crumbs = note.folder ? note.folder.split("/") : [];
  return (
    <>
      <div className="mb-2 text-xs text-slate-500">Vault / {crumbs.join(" / ")}{crumbs.length ? " / " : ""}{note.name}.md</div>
      <PageHeader title={note.title}>
        {str(note.frontmatter.status) && <Badge tone="sky">{str(note.frontmatter.status)}</Badge>}
      </PageHeader>
      {isBoard && <p className="mb-4 text-sm text-slate-400">This is the Obsidian Kanban board file. The interactive board in this app is built from task frontmatter: <Link className="text-sky-300" href="/tasks">Tasks</Link>.</p>}
      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-3"><Markdown html={renderMarkdown(note.body.replace(/^#\s+.+$/m, ""), vault.notes)} /></Card>
        <div className="space-y-4">
          {fm.length > 0 && (
            <Card title="Properties">
              <dl className="space-y-1 text-sm">
                {fm.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right text-slate-300">{str(v) || "—"}</dd></div>
                ))}
              </dl>
            </Card>
          )}
          <Card title={`Backlinks (${backlinks.length})`}>
            {backlinks.length === 0 ? <p className="text-sm text-slate-500">None</p> : (
              <ul className="space-y-1 text-sm">{backlinks.map((b) => <li key={b.path}><Link className="text-sky-300 hover:text-sky-200" href={noteHref(b.path)}>{b.title}</Link></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
