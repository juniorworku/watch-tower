import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, expectedSessionToken, passwordConfigured, safeEqual } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Agent machine API uses Bearer WATCHTOWER_API_KEY — checked in the route handlers.
  if (pathname === "/api/cron" || pathname === "/api/agents" || pathname.startsWith("/api/agents/")) {
    return NextResponse.next();
  }

  if (!passwordConfigured()) {
    if (pathname === "/locked") return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD is not set" },
        { status: 503 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/locked";
    url.search = "";
    return NextResponse.rewrite(url, { status: 503 });
  }

  if (pathname === "/locked") return NextResponse.redirect(new URL("/", req.url));
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value || "";
  if (token && safeEqual(token, await expectedSessionToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt).*)"],
};
