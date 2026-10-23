"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "@/components/workflow-controls";
function download(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: name.endsWith("json") ? "application/json" : "text/plain" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AgentConnect({ id, hasCredential }: { id: string; hasCredential: boolean }) {
  const router = useRouter(); const [files, setFiles] = useState<Record<string, string> | null>(null); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function generate() {
    setBusy(true); setNotice("");
    try { const data = await send(`/api/registry/${id}/setup`, {}); setFiles(data.files); setNotice("Setup ready. Download and keep these files private; the credential is only available in this response."); router.refresh(); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-4"><p className="text-sm text-slate-600">Create a credential scoped to this agent and download ready-to-use runtime files. Generating a new setup replaces its previous credential.</p><div className="flex flex-wrap gap-2"><button disabled={busy} className="primary-button" onClick={generate}>{busy ? "Generating…" : hasCredential ? "Rotate credential & generate setup" : "Generate agent setup"}</button>{hasCredential && <button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); try { await send(`/api/registry/${id}/setup`, { action: "revoke" }); setFiles(null); setNotice("Agent credential revoked"); router.refresh(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }}>Revoke credential</button>}</div><p role="status" className="text-sm text-slate-600">{notice}</p>
    {files && <><div className="rounded-xl bg-indigo-50 p-4"><h3 className="text-sm font-semibold">Automatic setup</h3><p className="my-2 text-sm text-slate-600">Download the installer, run it in a new private folder on your agent machine, then start the runner. Node.js 20 or newer is required.</p><button className="secondary-button" onClick={() => download("watchtower-setup.mjs", `import { writeFile } from 'node:fs/promises';\nconst files = ${JSON.stringify(files)};\nfor (const [name, body] of Object.entries(files)) await writeFile(name, body, {mode: 0o600, flag: 'wx'});\nconsole.log('Setup complete. Run: node agent-runner.mjs watchtower-agent.json');\n`)}>Download installer</button><code className="mt-3 block text-xs">node watchtower-setup.mjs</code></div><div><h3 className="mb-2 text-sm font-semibold">Manual setup</h3><div className="flex flex-wrap gap-2">{Object.entries(files).map(([name, text]) => <button key={name} className="secondary-button" onClick={() => download(name, text)}>{name} ↓</button>)}</div></div><p className="text-sm text-slate-500">The runner sends heartbeats and receives messages. Configure WATCHTOWER_TASK_COMMAND, WATCHTOWER_MESSAGE_COMMAND, and optionally WATCHTOWER_REVIEW_COMMAND with your local agent executables to execute work and reply. Each executable reads JSON from stdin. See the downloaded runner for the output contract.</p></>}
  </div>;
}
