import { NextResponse, type NextRequest } from "next/server";

/** Fast cookie-presence gate. The server layout and every API validate the signature. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname === "/login" || pathname === "/unavailable" || pathname === "/locked") return NextResponse.next();
  if (req.cookies.get("wt_session")?.value) return NextResponse.next();
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt).*)"] };
