import Link from "next/link";
import { getStore } from "@/lib/data/store";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import { WorkflowForm, ActionButton } from "@/components/workflow-controls";
import { LiveRefresh } from "@/components/live-refresh";
import { formatDateTime } from "@/lib/time";
export const dynamic = "force-dynamic";
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const store = await getStore();
  const sp = await searchParams;
  const agent = store.agents.find(a => a.id === sp.agent) || store.agents[0];
  const messages = (store.messages || []).filter(m => m.agentId === agent?.id);
  return <><LiveRefresh /><PageHeader title="Agent messages" subtitle="Send instructions, follow delivery status, and read verified channel replies." />
    <div className="grid items-start gap-6 lg:grid-cols-4">
      <Card title="Your agents"><div className="space-y-1">{store.agents.map(a => <Link key={a.id} href={`/messages?agent=${a.id}`} className={`block rounded-lg p-3 text-sm ${a.id === agent?.id ? "bg-indigo-50 font-semibold text-indigo-600" : "text-slate-500 hover:bg-slate-50"}`}><span className="block">{a.name}</span><span className="mt-1 block text-xs font-normal text-slate-400">{a.connection?.provider || "Runtime inbox"}</span></Link>)}</div>{!agent && <Empty>Create an agent to start a conversation.</Empty>}</Card>
      <div className="space-y-5 lg:col-span-3">{agent && <>
        {agent.connection && <Card title={`${agent.platform} connection`} action={<Link className="text-sm text-indigo-600" href={`/bots/${agent.id}?tab=connect`}>Connection & delivery history →</Link>}><p className="mb-3 text-sm text-slate-500">{agent.connection.enabled ? `Messages queue for ${agent.connection.provider}. The delivery worker sends them automatically.` : "Channel disabled. Messages stay in the runtime inbox."}</p><ActionButton url={`/api/registry/${agent.id}/deliveries`} payload={{ action: "dispatch" }} label="Send pending messages" /></Card>}
        <Card title={`Conversation with ${agent.name}`}><div className="space-y-5">
          {!messages.length && <Empty>No messages yet.</Empty>}
          {messages.map(m => {
            const inbound = m.direction === "inbound";
            const status = m.repliedAt ? "Answered" : m.deliveryStatus ? m.deliveryStatus[0].toUpperCase() + m.deliveryStatus.slice(1) : m.deliveredAt ? "Delivered" : "Queued";
            return <div key={m.id}><div className={`max-w-[90%] rounded-2xl p-4 ${inbound ? "mr-auto rounded-tl-sm bg-slate-50" : "ml-auto rounded-tr-sm bg-indigo-50"}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{inbound ? agent.name : "You"}{m.provider ? ` · ${m.provider}` : ""} · {formatDateTime(m.createdAt)}</span>{!inbound && <Badge tone={m.repliedAt || m.deliveryStatus === "read" ? "green" : m.deliveryStatus === "failed" || m.deliveryStatus === "unknown" ? "red" : "slate"}>{status}</Badge>}</div><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.text}</p></div>{m.reply && <div className="mr-auto mt-3 max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-50 p-4"><p className="mb-2 text-xs text-slate-500">{agent.name} · {formatDateTime(m.repliedAt)}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.reply}</p></div>}</div>;
          })}
        </div></Card>
        <Card title="New message"><WorkflowForm key={agent.id} url="/api/messages" payload={{ agentId: agent.id }} fields={[{ name: "text", label: "Message", type: "textarea", required: true }]} label="Send to agent" /><p className="mt-3 text-xs text-slate-400">{agent.connection?.enabled ? "Queued messages use the connected platform. Sent means the provider accepted the message; WhatsApp can additionally report Delivered and Read." : `Delivery and replies require the agent runtime to poll its inbox every ${agent.heartbeatIntervalMinutes || 15} minutes.`}</p></Card>
      </>}</div>
    </div>
  </>;
}
