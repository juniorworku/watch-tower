import "server-only";
import { GOOGLE_BASE_ENV, GOOGLE_SETUP_STEPS, googleConfigured, googleGet } from "./google-auth";
import { errorMessage, nowIso, notConfigured, type FetchResult, type Health, type IntegrationAdapter } from "./types";

export type GmailSummary = { email: string; inboxUnread: number; inboxTotal: number };

export const gmail: IntegrationAdapter<GmailSummary> = {
  id: "gmail",
  name: "Gmail",
  purpose: "Inbox counts only (unread / total), via the metadata scope. No message bodies are read.",
  envVars: GOOGLE_BASE_ENV,
  setupSteps: GOOGLE_SETUP_STEPS,
  isConfigured: googleConfigured,
  async health(): Promise<Health> {
    if (!googleConfigured()) return { status: "not_configured", detail: "Not connected.", checkedAt: nowIso() };
    try {
      const p = await googleGet<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile");
      return { status: "connected", detail: `Mailbox ${p.emailAddress} reachable.`, checkedAt: nowIso() };
    } catch (e) {
      return { status: "error", detail: errorMessage(e), checkedAt: nowIso() };
    }
  },
  async fetch(): Promise<FetchResult<GmailSummary>> {
    if (!googleConfigured()) return notConfigured(this.name);
    try {
      const [p, inbox] = await Promise.all([
        googleGet<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile"),
        googleGet<{ messagesUnread: number; messagesTotal: number }>("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX"),
      ]);
      return { ok: true, data: { email: p.emailAddress, inboxUnread: inbox.messagesUnread, inboxTotal: inbox.messagesTotal }, fetchedAt: nowIso() };
    } catch (e) {
      return { ok: false, reason: "error", message: errorMessage(e) };
    }
  },
};
