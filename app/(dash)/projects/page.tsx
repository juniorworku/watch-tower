import { ProjectEditForm } from "@/components/forms";
import { Badge, Card, Empty, Markdown, PageHeader } from "@/components/ui";
import { getStore } from "@/lib/data/store";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/time";
import { getVault } from "@/lib/vault/source";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [store, vault] = await Promise.all([getStore(), getVault()]);
  const active = store.projects.filter((p) => !p.archived);
  const archived = store.projects.filter((p) => p.archived);

  const render = (p: (typeof active)[number]) => {
    const mine = store.tasks.filter((t) => t.project.toLowerCase() === p.name.toLowerCase());
    return (
      <Card key={p.id} title={<span className="text-base normal-case tracking-normal text-slate-900">{p.name}</span>} action={<Badge tone={p.archived ? "slate" : "green"}>{p.status}</Badge>}>
        <p className="mb-3 text-xs text-slate-500">Owner: {p.owner || "—"} · Started: {formatDate(p.started) || "—"}</p>
        {p.body && <Markdown html={renderMarkdown(p.body.replace(/^#\s+.+$/m, "").split(/\n## /)[0], vault.notes)} className="prose-sm" />}
        <div className="mt-4">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Tasks ({mine.length})</h3>
          {mine.length === 0 ? (
            <p className="text-sm text-slate-500">No linked tasks.</p>
          ) : (
            <ul className="space-y-1">
              {mine.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">{t.title}</span>
                  <Badge tone={t.status === "done" ? "green" : t.status === "blocked" ? "red" : "amber"}>{t.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ProjectEditForm id={p.id} name={p.name} status={p.status} archived={p.archived} owner={p.owner} />
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Projects" subtitle="Editable project records in Blob (seeded from the vault)." />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Active ({active.length})</h2>
      <div className="grid gap-4 xl:grid-cols-2">{active.length ? active.map(render) : <Empty>No active projects.</Empty>}</div>
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Archive ({archived.length})</h2>
      <div className="grid gap-4 xl:grid-cols-2">{archived.length ? archived.map(render) : <Empty>No archived projects.</Empty>}</div>
    </>
  );
}
