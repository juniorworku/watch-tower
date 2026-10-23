import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/data/api-auth";
import { loadStore } from "@/lib/data/store";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;
  const store = await loadStore();
  const agent = store.agents.find(a => a.id === id);
  if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
  return NextResponse.json({ instructions: agent.instructions || "", heartbeatIntervalMinutes: agent.heartbeatIntervalMinutes || 15, tasks: store.tasks.filter(t => t.assigneeId === id) });
}
