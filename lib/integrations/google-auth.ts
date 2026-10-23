import "server-only";
import { fetchJson } from "./types";

export const GOOGLE_BASE_ENV = [
  { name: "GOOGLE_CLIENT_ID", required: true, description: "OAuth 2.0 client ID (Google Cloud Console > APIs & Services > Credentials).", secret: false },
  { name: "GOOGLE_CLIENT_SECRET", required: true, description: "OAuth 2.0 client secret for that client.", secret: true },
  { name: "GOOGLE_REFRESH_TOKEN", required: true, description: "Refresh token for Junior's Google account, granted the read-only scopes listed below.", secret: true },
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

let cached: { token: string; expiresAt: number } | null = null;

export async function googleAccessToken(): Promise<string> {
  if (!googleConfigured()) throw new Error("Google OAuth env vars are not set.");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const j = await fetchJson<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function googleGet<T>(url: string): Promise<T> {
  const token = await googleAccessToken();
  return fetchJson<T>(url, { headers: { Authorization: `Bearer ${token}` } });
}

export const GOOGLE_SETUP_STEPS = [
  "In Google Cloud Console, create (or reuse) a project and enable the Google Drive API, Google Calendar API and Gmail API.",
  "Configure the OAuth consent screen (External, Testing is fine) and add Junior's Google account as a test user.",
  "Create an OAuth client ID of type 'Web application'. Add https://developers.google.com/oauthplayground as an authorised redirect URI.",
  "In the OAuth 2.0 Playground (gear icon > 'Use your own OAuth credentials'), authorise these read-only scopes: https://www.googleapis.com/auth/drive.readonly, https://www.googleapis.com/auth/calendar.readonly, https://www.googleapis.com/auth/gmail.metadata — then exchange the code for a refresh token.",
  "In Vercel > watch-tower-dashboard > Settings > Environment Variables, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (Preview and/or Production), then redeploy.",
];
