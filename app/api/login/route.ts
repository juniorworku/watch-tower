import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, expectedSessionToken, safeNext } from "@/lib/auth";
import { checkPassword } from "@/lib/verify-password";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") || "");
  const next = safeNext(String(form.get("next") || "/"));
  if (!(await checkPassword(password))) {
    await new Promise((r) => setTimeout(r, 600));
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  const https =
    req.headers.get("x-forwarded-proto") === "https" ||
    process.env.COOKIE_SECURE === "1";
  res.cookies.set(SESSION_COOKIE, await expectedSessionToken(), {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
