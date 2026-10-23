"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function TaskAssignment({ id, assigneeId, agents, locked = false }: { id: string; assigneeId?: string | null; agents: { id: string; name: string }[]; locked?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="mt-3 text-xs"><label>Assigned bot<select aria-label="Assigned bot" value={assigneeId || ""} disabled={busy || locked} className="mt-2 block w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2 text-sm" onChange={async e => {
    const value = e.target.value;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, assigneeId: value || null }) });
      if (!res.ok) throw new Error((await res.json()).error || "Assignment failed");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Assignment failed"); }
    finally { setBusy(false); }
  }}><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{error && <p role="alert" className="text-rose-700">{error}</p>}</div>;
}
