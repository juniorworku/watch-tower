"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function TaskCreateForm({ owners, projects }: { owners: string[]; projects: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        status: fd.get("status") || "todo",
        owner: fd.get("owner"),
        project: fd.get("project"),
        due: fd.get("due"),
        body: fd.get("body"),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Failed");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="mb-4 grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-6">
      <input name="title" required placeholder="New task title" className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <select name="status" defaultValue="todo" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        <option value="todo">Todo</option>
        <option value="doing">Doing</option>
        <option value="blocked">Blocked</option>
        <option value="done">Done</option>
      </select>
      <input name="owner" list="owners" placeholder="Owner" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <datalist id="owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
      <input name="project" list="projects" placeholder="Project" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <datalist id="projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
      <input name="due" type="date" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="body" placeholder="Notes (optional)" className="md:col-span-5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50">{busy ? "…" : "Add task"}</button>
      {err && <p className="md:col-span-6 text-sm text-rose-300">{err}</p>}
    </form>
  );
}

export function TaskMoveButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const statuses = ["todo", "doing", "blocked", "done"] as const;
  async function move(next: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    router.refresh();
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {statuses
        .filter((s) => s !== status)
        .map((s) => (
          <button key={s} type="button" onClick={() => move(s)} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300 hover:bg-sky-500/20 hover:text-sky-200">
            → {s}
          </button>
        ))}
    </div>
  );
}

export function LogCreateForm({ agents }: { agents: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: fd.get("date"), agent: fd.get("agent"), body: fd.get("body") }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
  return (
    <form onSubmit={onSubmit} className="mb-4 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap gap-2">
        <input name="date" type="date" defaultValue={today} required className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <select name="agent" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="">(no agent section)</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <textarea name="body" required rows={3} placeholder="What happened?" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950">{busy ? "…" : "Add log entry"}</button>
    </form>
  );
}

export function ProjectEditForm({ id, name, status, archived, owner }: { id: string; name: string; status: string; archived: boolean; owner: string }) {
  const router = useRouter();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
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
    <form onSubmit={onSubmit} className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3 text-sm">
      <input name="name" defaultValue={name} className="rounded border border-slate-700 bg-slate-950 px-2 py-1" />
      <input name="status" defaultValue={status} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1" />
      <input name="owner" defaultValue={owner} placeholder="Owner" className="rounded border border-slate-700 bg-slate-950 px-2 py-1" />
      <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" name="archived" defaultChecked={archived} /> Archived</label>
      <button className="rounded bg-slate-700 px-2 py-1 text-xs text-white">Save</button>
    </form>
  );
}

const PLATFORMS = ["Grok Bot", "OpenAI/ChatGPT", "Claude", "Cursor", "n8n", "Zapier", "Make", "Slack", "custom"];

export function AgentRegistryForm({ parents }: { parents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Failed");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="mb-6 grid gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-3">
      <h2 className="md:col-span-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Add bot / agent / sub-agent</h2>
      <input name="name" required placeholder="Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <select name="platform" defaultValue="Grok Bot" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select name="type" defaultValue="agent" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        <option value="bot">bot</option>
        <option value="agent">agent</option>
        <option value="sub-agent">sub-agent</option>
      </select>
      <select name="parentId" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        <option value="">No parent</option>
        {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="role" placeholder="Role / description" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="owner" placeholder="Owner" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="status" defaultValue="active" placeholder="Status" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="url" placeholder="Link / URL" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="webhook" placeholder="Webhook / API endpoint" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <input name="tags" placeholder="Tags (comma-separated)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
      <button disabled={busy} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950">{busy ? "…" : "Add to registry"}</button>
      {err && <p className="md:col-span-3 text-sm text-rose-300">{err}</p>}
    </form>
  );
}

export function AgentDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-xs text-rose-300 hover:underline"
      onClick={async () => {
        if (!confirm(`Remove ${name}?`)) return;
        await fetch("/api/registry", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        router.refresh();
      }}
    >
      Remove
    </button>
  );
}
