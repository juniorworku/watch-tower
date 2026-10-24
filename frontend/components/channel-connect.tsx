"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentItem, ChannelConnection, ChannelDelivery } from "@/lib/data/types";

type Setup = { connection: ChannelConnection | null; webhookUrl: string; health: { state: string; missing: string[] } };
const labels = { telegram: "Telegram", slack: "Slack", whatsapp: "WhatsApp" };

export function ChannelConnect({ agent }: { agent: AgentItem }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [deliveries, setDeliveries] = useState<ChannelDelivery[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<"telegram" | "slack" | "whatsapp">((agent.connection?.provider || ({ Telegram: "telegram", WhatsApp: "whatsapp" } as const)[agent.platform as "Telegram" | "WhatsApp"] || "slack"));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch(`/api/registry/${agent.id}/channel`), fetch(`/api/registry/${agent.id}/deliveries`)]);
    const config = await a.json(); const history = await b.json();
    if (!a.ok || !b.ok) throw new Error(config.error || history.error || "Unable to load connection");
    setSetup(config); setDeliveries(history.deliveries); setCounts(history.counts);
  }, [agent.id]);
  useEffect(() => { load().catch(e => setNotice(e.message)); }, [load]);
  async function action(url: string, data: object, method = "POST") {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");
      await load(); router.refresh(); setNotice(result.processed !== undefined ? `Processed ${result.processed} deliveries. Refresh history to see updated status.` : "Connection updated");
    } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    action(`/api/registry/${agent.id}/channel`, { ...Object.fromEntries(data), provider, enabled: data.get("enabled") === "on" }, "PUT");
  }
  const connection = setup?.connection;
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-slate-600">Connect a messaging channel to receive assignments, review feedback, and direct messages. Your agent runtime performs the work; trusted senders can report progress from chat.</p>
    {setup && <div className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-medium">{setup.health.state.replaceAll("_", " ")}</p>{setup.health.missing.length > 0 && <p className="mt-2 text-amber-700">Set these backend environment variables: {setup.health.missing.join(", ")}</p>}{connection?.lastInboundAt && <p className="mt-2">Last verified inbound message: {new Date(connection.lastInboundAt).toLocaleString()}</p>}{connection?.lastError && <p className="mt-2 text-rose-700">{connection.lastError}</p>}</div>}
    {setup && <form key={connection?.id || "new"} onSubmit={save} className="space-y-4">
      <label className="field-label">Platform<select value={provider} onChange={e => setProvider(e.target.value as typeof provider)} className="field mt-1 w-full">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">{provider === "telegram" ? "Chat ID" : provider === "slack" ? "Channel or DM ID" : "Recipient number (country code, digits only)"}<input name="destination" required defaultValue={connection?.destination} className="field mt-1 w-full" /></label><label className="field-label">Allowed sender IDs (comma separated)<input name="allowedSenders" required defaultValue={connection?.allowedSenders.join(", ")} className="field mt-1 w-full" /></label></div>
      <p className="text-xs text-slate-500">Use Telegram numeric user IDs, Slack user/bot IDs, or the WhatsApp recipient number. Only these senders can update this agent’s assigned tasks.</p>
      <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Bot token environment variable<input name="tokenEnv" required pattern="BOT_[A-Z0-9_]+" placeholder="BOT_RESEARCH_TOKEN" defaultValue={connection?.tokenEnv} className="field mt-1 w-full" /></label><label className="field-label">{provider === "telegram" ? "Webhook secret" : provider === "slack" ? "Signing secret" : "Meta app secret"} environment variable<input name="secretEnv" required pattern="BOT_[A-Z0-9_]+" placeholder="BOT_RESEARCH_SECRET" defaultValue={connection?.secretEnv} className="field mt-1 w-full" /></label></div>
      <p className="text-xs text-slate-500">Enter variable names here. Store their credential values in the backend environment, then restart or redeploy. Credentials are never entered into this form.</p>
      {provider === "slack" && <label className="field-label">Workspace ID<input required name="workspaceId" defaultValue={connection?.workspaceId} className="field mt-1 w-full" placeholder="T…" /></label>}
      {provider === "whatsapp" && <><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Meta phone number ID<input required name="accountId" defaultValue={connection?.accountId} className="field mt-1 w-full" /></label><label className="field-label">Graph API version from Meta app<input required name="apiVersion" pattern="v[0-9]+\.[0-9]+" defaultValue={connection?.apiVersion} className="field mt-1 w-full" /></label></div><label className="field-label">Verification token environment variable<input required name="verifyTokenEnv" pattern="BOT_[A-Z0-9_]+" defaultValue={connection?.verifyTokenEnv} className="field mt-1 w-full" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Approved template name (optional)<input name="templateName" defaultValue={connection?.templateName} className="field mt-1 w-full" /></label><label className="field-label">Template language<input name="templateLanguage" defaultValue={connection?.templateLanguage || "en_US"} className="field mt-1 w-full" /></label></div><p className="text-xs text-slate-500">Outside the 24-hour conversation window, configure an approved template with one body text parameter. WhatsApp allowed sender must equal the recipient number.</p></>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={connection?.enabled ?? true} />Enable this connection</label>
      <p className="text-xs text-slate-500">Changing this connection cancels unsent messages. Sent messages remain in history.</p>
      <button disabled={busy} className="primary-button">{busy ? "Working…" : "Save channel connection"}</button>
    </form>}
    {connection && <div className="space-y-3"><h3 className="text-sm font-semibold">Provider webhook URL</h3><code className="block break-all rounded-lg bg-slate-50 p-3 text-xs">{setup?.webhookUrl}</code><p className="text-sm leading-6 text-slate-600">{provider === "telegram" ? "Register this URL with setWebhook and set secret_token to your webhook secret. Start a chat with the bot first. Telegram bots cannot message other bots. For an existing runtime webhook, integrate the Watch Tower agent API there instead of replacing it." : provider === "slack" ? "Subscribe your Slack app to message events for this channel or DMs. Use this URL as the Events API request URL. Grant chat:write and the required message history scopes, and invite the app to the channel." : "Subscribe your Meta app to WhatsApp messages using this callback URL and your verification token. Enable messages and delivery status webhooks."}</p></div>}
    <div className="space-y-3"><h3 className="text-sm font-semibold">Delivery queue</h3><p className="text-xs text-slate-500">{Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join(" · ")}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => action(`/api/registry/${agent.id}/deliveries`, { action: "dispatch" })} className="secondary-button">Send pending messages</button><button type="button" onClick={() => load().catch(e => setNotice(e.message))} className="secondary-button">Refresh history</button>{connection && <button type="button" disabled={busy} className="secondary-button" onClick={() => action(`/api/registry/${agent.id}/channel`, { disconnect: true }, "PUT")}>Disconnect</button>}</div><p className="text-xs text-slate-500">Docker’s channel worker sends queued messages automatically. Hosted deployments need a scheduler calling the protected cron endpoint, or use Send pending messages.</p>
      <div className="max-h-96 space-y-3 overflow-auto">{deliveries.map(row => <div key={row.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="flex justify-between gap-3"><span>{row.provider} · {row.status}{row.providerStatus ? ` · ${row.providerStatus}` : ""}</span><span className="text-xs text-slate-400">{row.attempts} attempt(s)</span></div><p className="mt-2 line-clamp-2 whitespace-pre-wrap text-slate-600">{row.text}</p>{row.lastError && <p className="mt-2 text-xs text-rose-700">{row.lastError}</p>}{row.status === "failed" && <button disabled={busy} className="mt-2 text-xs text-indigo-600" onClick={() => action(`/api/registry/${agent.id}/deliveries`, { action: "retry", id: row.id })}>Retry</button>}{row.status === "unknown" && <button disabled={busy} className="mt-2 text-xs text-indigo-600" onClick={() => { if (window.confirm("This message may already have arrived. Check the provider conversation first. Retry even if this could send a duplicate?")) action(`/api/registry/${agent.id}/deliveries`, { action: "retry", id: row.id, confirmDuplicateRisk: true }); }}>Retry after checking conversation</button>}</div>)}</div>
    </div>
    <div className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-semibold">Chat commands</h3><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-6">{`/heartbeat\n/accept TASK_ID\n/start TASK_ID\n/progress TASK_ID update\n/block TASK_ID reason\n/reject TASK_ID reason\n/submit TASK_ID title | result\n/reply MESSAGE_ID response`}</pre><p className="mt-2 text-xs text-slate-500">Submit sends the task to Review. Approval and change requests stay in Watch Tower. In Slack, mention the app before the command, for example @WatchTower /start TASK_ID.</p></div>
    <p role="status" className="text-sm">{notice}</p>
  </div>;
}
