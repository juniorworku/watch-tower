"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AgentItem, TaskItem } from "@/lib/data/types";

async function patch(url: string, body: object) {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save changes");
}

export function ReviewForm({ task }: { task: TaskItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function act(action: string) {
    setBusy(true); setError("");
    try { await patch("/api/tasks", { id: task.id, action, message }); setMessage(""); router.refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <label className="field-label" htmlFor="feedback">{task.status === "review" ? "Review feedback" : "Add a comment"}</label>
    <textarea id="feedback" value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Share feedback, clarify requirements, or leave an update…" className="field w-full" />
    <div className="flex flex-wrap gap-2">
      {task.status === "review" && <><button disabled={busy} onClick={() => act("approve")} className="primary-button">Approve deliverable</button><button disabled={busy || !message.trim()} onClick={() => act("request_changes")} className="secondary-button">Request changes</button></>}
      <button disabled={busy || !message.trim()} onClick={() => act("comment")} className="secondary-button">Post comment</button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}

export function TaskEditForm({ task, projects = [], tasks = [] }: { task: TaskItem; projects?: { id: string; name: string }[]; tasks?: TaskItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setNotice("");
    const fd = new FormData(e.currentTarget);
    try { await patch("/api/tasks", { ...Object.fromEntries(fd), id: task.id, dependsOn: fd.getAll("dependsOn") }); setNotice("Changes saved"); router.refresh(); }
    catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <label className="field-label">Title<input className="field mt-1 w-full" name="title" required defaultValue={task.title} /></label>
    <label className="field-label">Description<textarea className="field mt-1 w-full" name="body" rows={5} defaultValue={task.body} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="field-label">Priority<select className="field mt-1 w-full" name="priority" defaultValue={task.priority || "normal"}>{["low", "normal", "high", "urgent"].map(p => <option key={p}>{p}</option>)}</select></label><label className="field-label">Due date<input className="field mt-1 w-full" type="date" name="due" defaultValue={task.due} /></label></div>
    <label className="field-label">Project<select className="field mt-1 w-full" name="projectId" defaultValue={task.projectId || projects.find(p => p.name === task.project)?.id || ""}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="field-label">Required agent tags<input className="field mt-1 w-full" name="requiredTags" defaultValue={task.requiredTags?.join(", ") || ""} /></label>
    <label className="field-label">Wait for these tasks<select multiple className="field mt-1 w-full" name="dependsOn" defaultValue={task.dependsOn || []}>{tasks.filter(t => t.id !== task.id && t.project === task.project).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select><span className="mt-1 block font-normal text-slate-400">Hold Ctrl or Command to select multiple dependencies.</span></label>
    <button className="secondary-button" disabled={busy}>{busy ? "Saving…" : "Save task"}</button><p className="text-sm" role="status">{notice}</p>
  </form>;
}

export function AgentSettingsForm({ agent }: { agent: AgentItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setNotice("");
    const fd = new FormData(e.currentTarget);
    try {
      await patch("/api/registry", { ...Object.fromEntries(fd), id: agent.id, heartbeatIntervalMinutes: Number(fd.get("heartbeatIntervalMinutes")) });
      setNotice("Agent settings saved"); router.refresh();
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Name<input name="name" required defaultValue={agent.name} className="field mt-1 w-full" /></label><label className="field-label">Role<input name="role" defaultValue={agent.role} className="field mt-1 w-full" /></label></div>
    <label className="field-label">Agent tags (comma separated)<input name="tags" defaultValue={agent.tags.join(", ")} className="field mt-1 w-full" /></label>
    <label className="field-label">Personality<textarea name="personality" rows={3} defaultValue={agent.personality || ""} placeholder="Tone, communication style, and working preferences." className="field mt-1 w-full" /></label>
    <label className="field-label">Instructions<textarea name="instructions" rows={8} defaultValue={agent.instructions || ""} placeholder="Responsibilities, expected outputs, and working guidelines for this agent." className="field mt-1 w-full" /></label>
    <label className="field-label">Expected heartbeat interval (minutes)<input name="heartbeatIntervalMinutes" type="number" min={1} max={1440} required defaultValue={agent.heartbeatIntervalMinutes || 15} className="field mt-1 w-full" /></label>
    <p className="text-xs text-slate-500">Marked offline after two missed intervals. Your agent runtime must send heartbeats on this schedule.</p>
    <button disabled={busy} className="primary-button">{busy ? "Saving…" : "Save settings"}</button><p role="status" className="text-sm">{notice}</p>
  </form>;
}
