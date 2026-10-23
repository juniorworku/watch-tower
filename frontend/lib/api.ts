import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export function backendUrl() {
  return (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

/** Server components forward the user's session; backend credentials never enter Next.js. */
export async function backendGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}${path}`, {
      headers: { Cookie: (await cookies()).toString() },
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error("FastAPI is unavailable. Start the backend and check BACKEND_URL.");
  }
  if (response.status === 401) redirect("/login");
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Backend returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
