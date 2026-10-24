import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { backendGet } from "./api";
import { sessionSecret, validSessionToken } from "./session-token";

/** Vercel shares server environment variables across services. Compose can keep
 * credentials exclusively in FastAPI, in which case use its session endpoint. */
export const dashboardSession = cache(async () => {
  const secret = sessionSecret(process.env);
  if (secret) return { configured: true, authenticated: validSessionToken((await cookies()).get("wt_session")?.value || "", secret) };
  return backendGet<{ configured: boolean; authenticated: boolean }>("/api/session");
});
