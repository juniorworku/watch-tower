import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mutateStore } from "@/lib/data/store";
import { LifecycleError } from "@/lib/data/lifecycle";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "revoke") {
      await mutateStore(s => { const a = s.agents.find(a => a.id === id); if (!a) throw new LifecycleError("agent not found", 404); delete a.credentialHash; delete a.credentialCreatedAt; });
      return NextResponse.json({ revoked: true });
    }
    const runner = await readFile(path.join(process.cwd(), "scripts/agent-runner.mjs"), "utf8");
    const credential = `wt_${randomBytes(32).toString("base64url")}`;
    const store = await mutateStore(s => {
      const a = s.agents.find(a => a.id === id);
      if (!a) throw new LifecycleError("agent not found", 404);
      a.credentialHash = createHash("sha256").update(credential).digest("hex"); a.credentialCreatedAt = new Date().toISOString();
    });
    const a = store.agents.find(a => a.id === id)!;
    const baseUrl = req.nextUrl.origin;
    const config = { baseUrl, agentId: id, apiKey: credential, heartbeatIntervalMinutes: a.heartbeatIntervalMinutes || 15 };
    const files = {
      "watchtower-agent.json": JSON.stringify(config, null, 2),
      "agent-runner.mjs": runner,
      "HEARTBEAT.md": `# ${a.name}: heartbeat\nEvery ${config.heartbeatIntervalMinutes} minutes, POST ${baseUrl}/api/agents/${id}/activity with Authorization: Bearer ${credential} and JSON {"kind":"heartbeat","message":"Checking in","pickup":true}.\nGET /api/agents/${id}/tasks for instructions, project docs, shared work and feedback. POST /api/agents/${id}/tasks to claim work atomically. GET /api/agents/${id}/messages for pending messages; acknowledge with POST {"messageId":"..."} and reply using {"messageId":"...","reply":"..."}.\n`,
      "PLAYBOOK.md": `# ${a.name}\nRole: ${a.role}\nPersonality: ${a.personality || "Professional and clear"}\n\n${a.instructions || "Follow project docs and task requirements."}\n\nWork one task at a time. Respect dependencies. Report progress or blockers to /api/agents/${id}/activity. Submit {taskId,kind:"submitted",message,deliverable:{title,content,url?}}. Wait for review; revise if requested. Project leads may POST {taskId,action:"approve"|"request_changes",message} to /api/agents/${id}/review, and create cross-agent subtasks via /delegate. Never approve your own deliverable.\n`,
    };
    return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
