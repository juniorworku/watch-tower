import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mutateStore } from "@/lib/data/store";
import { tickSchedules } from "@/lib/data/workflows";
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let result;
  await mutateStore(s => { result = tickSchedules(s, new Date().toISOString()); });
  return NextResponse.json(result);
}
