import { type NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// HTTP transport only. FastAPI is the sole implementation and authentication layer.
async function forward(request: NextRequest) {
  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]) headers.delete(name);
  try {
    const upstream = await fetch(`${backend}${request.nextUrl.pathname}${request.nextUrl.search}`, {
      method: request.method, headers, redirect: "manual", cache: "no-store",
      signal: AbortSignal.timeout(60000),
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.arrayBuffer() }),
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const name of ["connection", "content-length", "transfer-encoding", "content-encoding"]) responseHeaders.delete(name);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "FastAPI is unavailable. Start the backend and check BACKEND_URL." }, { status: 503 });
  }
}
export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE, forward as OPTIONS, forward as HEAD };
