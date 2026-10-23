import Link from "next/link";
import { getStore } from "@/lib/data/store";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-controls";
import { LiveRefresh } from "@/components/live-refresh";
import { formatDateTime } from "@/lib/time";
export const dynamic = "force-dynamic";
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const store = await getStore(); const sp = await searchParams; const agent = store.agents.find(a => a.id === sp.agent) || store.agents[0];
  const messages = (store.messages || []).filter(m => m.agentId === agent?.id);
  return <><LiveRefresh /><PageHeader title="Agent messages" subtitle="Send instructions or ask for an update. Replies arrive when the agent checks in." />
    <div className="grid items-start gap-6 lg:grid-cols-4"><Card title="Your agents"><div className="space-y-1">{store.agents.map(a => <Link key={a.id} href={`/messages?agent=${a.id}`} className={`block rounded-lg p-3 text-sm ${a.id === agent?.id ? "bg-indigo-50 font-semibold text-indigo-600" : "text-slate-500 hover:bg-slate-50"}`}>{a.name}</Link>)}</div>{!agent && <Empty>Create an agent to start a conversation.</Empty>}</Card><div className="space-y-5 lg:col-span-3">{agent && <><Card title={`Conversation with ${agent.name}`}><div className="space-y-5">{!messages.length && <Empty>No messages yet.</Empty>}{messages.map(m => <div key={m.id}><div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-indigo-50 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>You · {formatDateTime(m.createdAt)}</span><Badge tone={m.repliedAt ? "green" : m.deliveredAt ? "sky" : "slate"}>{m.repliedAt ? "Answered" : m.deliveredAt ? "Delivered" : "Queued"}</Badge></div><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.text}</p></div>{m.reply && <div className="mr-auto mt-3 max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-50 p-4"><p className="mb-2 text-xs text-slate-500">{agent.name} · {formatDateTime(m.repliedAt)}</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.reply}</p></div>}</div>)}</div></Card><Card title="New message"><WorkflowForm key={agent.id} url="/api/messages" payload={{ agentId: agent.id }} fields={[{ name: "text", label: "Message", type: "textarea", required: true }]} label="Send to agent" /><p className="mt-3 text-xs text-slate-400">Delivery and replies require the agent runtime to poll its inbox. Expected check-in: every {agent.heartbeatIntervalMinutes || 15} minutes.</p></Card></>}</div></div>
  </>;
}
