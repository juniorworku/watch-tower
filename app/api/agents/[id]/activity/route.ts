import { NextResponse, type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/data/api-auth";
import { mutateStore, newId } from "@/lib/data/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "heartbeat" || body.kind === "status" ? body.kind : "activity";
  const message = String(body.message || body.text || (kind === "heartbeat" ? "heartbeat" : "")).trim();
  if (!message && kind !== "heartbeat") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const now = new Date().toISOString();
  let found = false;
  let activity;
  await mutateStore((s) => {
    const agent = s.agents.find((a) => a.id === id);
    if (!agent) return;
    found = true;
    activity = {
      id: newId("act"),
      agentId: id,
      kind: kind as "heartbeat" | "activity" | "status",
      message: message || "heartbeat",
      meta: typeof body.meta === "object" && body.meta ? body.meta : undefined,
      at: now,
    };
    s.activities.unshift(activity);
    s.activities = s.activities.slice(0, 500);
    if (kind === "heartbeat") agent.lastHeartbeat = now;
    agent.lastActivity = now;
    agent.lastActivityText = activity.message.slice(0, 280);
    if (body.status) agent.status = String(body.status).trim();
    agent.updatedAt = now;
  });
  if (!found) return NextResponse.json({ error: "agent not found" }, { status: 404 });
  return NextResponse.json({ activity }, { status: 201 });
}
