import { NextResponse, type NextRequest } from "next/server";
import { getStore, mutateStore, newId } from "@/lib/data/store";

export const runtime = "nodejs";

export async function GET() {
  const store = await getStore();
  return NextResponse.json({ logs: store.logs });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || new Date().toISOString().slice(0, 10)).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const text = String(body.body || body.text || "").trim();
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  const agent = String(body.agent || "").trim();
  const now = new Date().toISOString();
  let entry;
  await mutateStore((s) => {
    const existing = s.logs.find((l) => l.date === date);
    const addition = agent ? `\n\n### ${agent}\n- ${text}` : `\n\n- ${text}`;
    if (existing) {
      existing.body = existing.body.trimEnd() + addition;
      existing.updatedAt = now;
      entry = existing;
    } else {
      entry = {
        id: newId("log"),
        date,
        body: `# ${date}\n\n## Summary\n${text}${agent ? `\n\n### ${agent}\n- ${text}` : ""}`,
        createdAt: now,
        updatedAt: now,
      };
      s.logs.unshift(entry);
    }
  });
  return NextResponse.json({ log: entry }, { status: 201 });
}
