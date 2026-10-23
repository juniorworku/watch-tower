import { NextResponse, type NextRequest } from "next/server";
import { statusPage } from "./lib/status-page";

/** UI navigation gate only; FastAPI independently authenticates every protected API. */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname === "/login" || pathname === "/unavailable") return NextResponse.next();
  let state: { configured: boolean; authenticated: boolean };
  try {
    const response = await fetch(`${(process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/api/session`, {
      headers: { Cookie: req.headers.get("cookie") || "" }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Backend unavailable");
    state = await response.json();
  } catch {
    return new NextResponse(statusPage("Backend unavailable", "Watch Tower cannot reach FastAPI. Start the backend and check BACKEND_URL, then try again."), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } });
  }
  if (!state.configured) {
    return pathname === "/locked" ? NextResponse.next() : new NextResponse(statusPage("Watch Tower is locked", "Configure DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD in the FastAPI backend environment, then restart it."), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (pathname === "/locked") return NextResponse.redirect(new URL("/", req.url));
  if (state.authenticated) return NextResponse.next();
  const login = new URL("/login", req.url); login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt).*)"] };
