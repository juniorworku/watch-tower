/** Compose calls FastAPI directly; Vercel routes /api on the public app origin. */
export function backendUrl() {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, "");
  if (process.env.WATCHTOWER_API_SAME_ORIGIN === "1") {
    if (!process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL is required for Vercel API routing");
    return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}
