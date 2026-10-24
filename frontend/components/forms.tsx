"use client";

import { TASK_LABELS } from "@/lib/data/types";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TaskCreateForm({ owners, projects, agents = [], projectRecords = [] }: { owners: string[]; projects: string[]; projectRecords?: { id: string; name: string }[]; agents?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: fd.get("assigneeId"),
          title: fd.get("title"),
          priority: fd.get("priority"),
          owner: fd.get("owner"),
          projectId: fd.get("projectId"),
        requiredTags: fd.get("requiredTags"),
          due: fd.get("due"),
          body: fd.get("body"),
        }),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error || "Failed");
        return;
      }
      form.reset();
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form id="task-create-form" onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
      <input name="title" required aria-label="Task title" placeholder="New task title" className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <select aria-label="Task priority" name="priority" defaultValue="normal" className="field">
        <option value="low">Low priority</option><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent priority</option>
      </select>
      <input name="owner" list="owners" placeholder="Owner" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <datalist id="owners">{[...new Set(owners.filter(Boolean))].map((o) => <option key={o} value={o} />)}</datalist>
      <select aria-label="Project" name="projectId" className="field"><option value="">No project</option>{projectRecords.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <input name="due" type="date" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <select aria-label="Assign new task to bot" name="assigneeId" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <input name="requiredTags" aria-label="Required agent tags" placeholder="Required tags: research, writing" className="field" />
      <input name="body" aria-label="Task description" placeholder="Description and expected outcome" className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "…" : "Add task"}</button>
      {err && <p className="md:col-span-3 text-sm text-rose-700">{err}</p>}
    </form>
  );
}

export function TaskMoveButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="mt-2 flex flex-wrap gap-1">
    {(status === "review" ? [] : ["todo", "assigned", "doing", "blocked"]).filter(s => s !== status).map(s => <button key={s} disabled={busy} type="button" className="rounded bg-slate-100 px-2 py-1 text-xs disabled:opacity-50" onClick={async () => {
      setBusy(true); setError("");
      try {
        const res = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: s }) });
        if (!res.ok) throw new Error((await res.json()).error || "Status update failed");
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Status update failed"); }
      finally { setBusy(false); }
    }}>→ {TASK_LABELS[s as keyof typeof TASK_LABELS]}</button>)}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
  </div>;
}

export function LogCreateForm({ agents }: { agents: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: fd.get("date"), agent: fd.get("agent"), body: fd.get("body") }),
    });
    setBusy(false);
    form.reset();
    router.refresh();
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-2xl border border-slate-200 bg-white/40 p-4">
      <div className="flex flex-wrap gap-2">
        <input name="date" type="date" defaultValue={today} required className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        <select name="agent" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">(no agent section)</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <textarea name="body" required rows={3} placeholder="What happened?" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">{busy ? "…" : "Add log entry"}</button>
    </form>
  );
}

export function ProjectEditForm({ id, name, status, archived, owner }: { id: string; name: string; status: string; archived: boolean; owner: string }) {
  const router = useRouter();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: fd.get("name"),
        status: fd.get("status"),
        owner: fd.get("owner"),
        archived: fd.get("archived") === "on",
      }),
    });
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 text-sm">
      <input name="name" defaultValue={name} className="rounded border border-slate-200 bg-white px-2 py-1" />
      <input name="status" defaultValue={status} className="w-28 rounded border border-slate-200 bg-white px-2 py-1" />
      <input name="owner" defaultValue={owner} placeholder="Owner" className="rounded border border-slate-200 bg-white px-2 py-1" />
      <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" name="archived" defaultChecked={archived} /> Archived</label>
      <button className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-900">Save</button>
    </form>
  );
}

const PLATFORMS = ["Grok Bot", "OpenAI/ChatGPT", "Claude", "Cursor", "n8n", "Zapier", "Make", "Telegram", "WhatsApp", "Slack", "custom"];

export function AgentRegistryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error || "Failed");
        return;
      }
      const created = await res.json();
      form.reset();
      if (["Telegram", "WhatsApp", "Slack"].includes(String(fd.get("platform"))) && created.agent?.id) router.push(`/bots/${created.agent.id}?tab=connect`);
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="mb-6 grid gap-2 rounded-2xl border border-slate-200 bg-white/40 p-4 md:grid-cols-3">
      <h2 className="md:col-span-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Add bot / agent / sub-agent</h2>
      <input name="name" required placeholder="Name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <select name="platform" defaultValue="Grok Bot" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select name="type" defaultValue="agent" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="bot">bot</option>
        <option value="agent">agent</option>
        <option value="sub-agent">sub-agent</option>
      </select>
      <select name="parentId" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="">No parent</option>
        {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="role" placeholder="Role / description" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input name="owner" placeholder="Owner" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input name="status" defaultValue="active" placeholder="Status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input name="url" placeholder="Link / URL" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input name="webhook" placeholder="Webhook / API endpoint" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <input name="tags" placeholder="Tags (comma-separated)" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">{busy ? "…" : "Add to registry"}</button>
      {err && <p className="md:col-span-3 text-sm text-rose-700">{err}</p>}
    </form>
  );
}

export function AgentDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-rose-700 hover:underline"
      onClick={async () => {
        if (!confirm(`Remove ${name}?`)) return;
        const res = await fetch("/api/registry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        if (!res.ok) { alert((await res.json()).error || "Removal failed"); return; }
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
