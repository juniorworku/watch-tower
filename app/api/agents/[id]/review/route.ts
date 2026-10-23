import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAuth } from "@/lib/data/api-auth";
import { mutateStore } from "@/lib/data/store";
import { leadReview } from "@/lib/data/workflows";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await requireAgentAuth(req, id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  if (!["approve", "request_changes"].includes(body.action)) return NextResponse.json({ error: "invalid review action" }, { status: 400 });
  try {
    const store = await mutateStore(s => { leadReview(s, id, String(body.taskId || ""), body.action, String(body.message || ""), new Date().toISOString()); });
    return NextResponse.json({ task: store.tasks.find(t => t.id === body.taskId) });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
