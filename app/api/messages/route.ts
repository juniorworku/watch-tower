import { NextResponse, type NextRequest } from "next/server";
import { mutateStore, newId } from "@/lib/data/store";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text || text.length > 20000) return NextResponse.json({ error: "message must contain 1–20000 characters" }, { status: 400 });
  const id = newId("message");
  try {
    const store = await mutateStore(s => {
      if (!s.agents.some(a => a.id === body.agentId)) throw new LifecycleError("agent not found", 404);
      (s.messages ||= []).push({ id, agentId: body.agentId, text, createdAt: new Date().toISOString() });
    });
    return NextResponse.json({ message: store.messages?.find(m => m.id === id) }, { status: 201 });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
