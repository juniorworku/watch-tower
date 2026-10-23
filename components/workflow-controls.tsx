"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TaskTemplate } from "@/lib/data/types";
export type Field = { name: string; label: string; type?: "text" | "textarea" | "select" | "multi" | "datetime-local" | "tags"; options?: { value: string; label: string }[]; value?: string | string[]; required?: boolean };
export async function send(url: string, body: object, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
export function WorkflowForm({ url, method = "POST", payload = {}, fields, label, redirect }: { url: string; method?: string; payload?: object; fields: Field[]; label: string; redirect?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form); setBusy(true); setNotice("");
    const data: Record<string, unknown> = { ...payload };
    for (const f of fields) {
      const value = String(fd.get(f.name) || "");
      data[f.name] = f.type === "multi" ? fd.getAll(f.name) : f.type === "tags" ? value.split(",").map(s => s.trim()).filter(Boolean) : f.type === "datetime-local" && value ? new Date(`${value}:00+03:00`).toISOString() : value;
    }
    try { const result = await send(url, data, method); if (url === "/api/messages") form.reset(); setNotice("Saved successfully"); if (redirect) router.push(redirect); else if (result.result?.id && payload && (payload as { action?: string }).action === "instantiate") router.push(`/tasks/${result.result.id}`); router.refresh(); }
    catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">{fields.map(f => <label key={f.name} className="field-label">{f.label}
    {f.type === "textarea" ? <textarea className="field mt-1 w-full" name={f.name} defaultValue={f.value} rows={5} required={f.required} /> : f.type === "select" || f.type === "multi" ? <select className="field mt-1 w-full" name={f.name} multiple={f.type === "multi"} defaultValue={f.value || (f.type === "multi" ? [] : "")} required={f.required}>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input className="field mt-1 w-full" type={f.type === "datetime-local" ? f.type : "text"} name={f.name} defaultValue={f.value} required={f.required} />}
    {f.type === "multi" && <span className="mt-1 block font-normal text-slate-400">Hold Ctrl or Command to select multiple.</span>}
  </label>)}<button className="primary-button" disabled={busy}>{busy ? "Saving…" : label}</button><p role="status" className="text-sm text-slate-600">{notice}</p></form>;
}
export function ActionButton({ url, payload, label, method = "POST" }: { url: string; payload: object; label: string; method?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  return <span className="inline-flex flex-col items-start gap-1"><button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); setNotice(""); try { const data = await send(url, payload, method); setNotice(data.result?.created !== undefined ? `Created ${data.result.created} task(s)${data.result.errors?.length ? `; ${data.result.errors.join("; ")}` : ""}` : "Saved"); router.refresh(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }}>{busy ? "Working…" : label}</button><span role="status" className="text-xs text-slate-500">{notice}</span></span>;
}
export function BlueprintForm({ template, projects, agents }: { template?: TaskTemplate; projects: { id: string; name: string }[]; agents: { id: string; name: string }[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [subtasks, setSubtasks] = useState(template?.blueprint.subtasks || []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); setBusy(true); setNotice("");
    try {
      await send("/api/automation", { action: "save_template", id: template?.id, name: fd.get("name"), blueprint: { title: fd.get("title"), body: fd.get("body"), priority: fd.get("priority"), projectId: fd.get("projectId") || null, assigneeId: fd.get("assigneeId") || null, requiredTags: String(fd.get("requiredTags") || "").split(",").map(t => t.trim()).filter(Boolean), subtasks } });
      setNotice("Template saved"); router.refresh();
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Template name<input name="name" required defaultValue={template?.name} className="field mt-1 w-full" /></label><label className="field-label">Task title<input name="title" required defaultValue={template?.blueprint.title} className="field mt-1 w-full" /></label></div><label className="field-label">Task description<textarea name="body" rows={4} defaultValue={template?.blueprint.body} className="field mt-1 w-full" /></label>
    <div className="grid gap-3 sm:grid-cols-3"><label className="field-label">Priority<select name="priority" defaultValue={template?.blueprint.priority || "normal"} className="field mt-1 w-full">{["urgent", "high", "normal", "low"].map(p => <option key={p}>{p}</option>)}</select></label><label className="field-label">Project<select name="projectId" defaultValue={template?.blueprint.projectId || ""} className="field mt-1 w-full"><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field-label">Assignee<select name="assigneeId" defaultValue={template?.blueprint.assigneeId || ""} className="field mt-1 w-full"><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    <label className="field-label">Required agent tags (comma separated)<input name="requiredTags" defaultValue={template?.blueprint.requiredTags?.join(", ")} className="field mt-1 w-full" /></label>
    <div className="space-y-3"><p className="field-label">Subtasks</p>{subtasks.map((s, i) => <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3"><input aria-label={`Subtask ${i + 1} title`} placeholder="Subtask title" className="field" required value={s.title} onChange={e => setSubtasks(items => items.map((t, n) => n === i ? { ...t, title: e.target.value } : t))} /><textarea aria-label={`Subtask ${i + 1} description`} placeholder="Description" className="field" value={s.body} onChange={e => setSubtasks(items => items.map((t, n) => n === i ? { ...t, body: e.target.value } : t))} /><select aria-label={`Subtask ${i + 1} agent`} className="field" value={s.assigneeId || ""} onChange={e => setSubtasks(items => items.map((t, n) => n === i ? { ...t, assigneeId: e.target.value || null } : t))}><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button type="button" className="text-left text-xs text-rose-600" onClick={() => setSubtasks(items => items.filter((_, n) => n !== i))}>Remove subtask</button></div>)}<button type="button" className="secondary-button" onClick={() => setSubtasks(items => [...items, { title: "", body: "" }])}>＋ Add subtask</button></div>
    <button disabled={busy} className="primary-button">{busy ? "Saving…" : "Save template"}</button><p role="status" className="text-sm">{notice}</p>
  </form>;
}
