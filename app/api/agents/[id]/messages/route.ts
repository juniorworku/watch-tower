import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAuth } from "@/lib/data/api-auth";
import { loadStore, mutateStore, newId } from "@/lib/data/store";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ messages: (await loadStore()).messages?.filter(m => m.agentId === id && !m.repliedAt) || [] });
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  try {
    const store = await mutateStore(s => {
      const agent = s.agents.find(a => a.id === id);
      if (!agent) throw new LifecycleError("agent not found", 404);
      const message = s.messages?.find(m => m.id === body.messageId && m.agentId === id);
      if (!message) throw new LifecycleError("message not found", 404);
      const now = new Date().toISOString();
      message.deliveredAt ||= now;
      if (body.reply !== undefined) {
        if (message.repliedAt) throw new LifecycleError("message already answered", 409);
        const reply = String(body.reply || "").trim();
        if (!reply || reply.length > 20000) throw new LifecycleError("reply must contain 1–20000 characters");
        message.reply = reply; message.repliedAt = now;
        s.activities.unshift({ id: newId("act"), agentId: id, kind: "message", message: reply, at: now, actor: "agent" });
      }
      agent.lastActivity = now; agent.lastActivityText = body.reply ? String(body.reply).slice(0, 280) : "Message received"; agent.updatedAt = now;
    });
    return NextResponse.json({ message: store.messages?.find(m => m.id === body.messageId) });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
