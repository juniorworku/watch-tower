import "server-only";
import { GOOGLE_BASE_ENV, GOOGLE_SETUP_STEPS, googleConfigured, googleGet } from "./google-auth";
import { errorMessage, nowIso, notConfigured, type FetchResult, type Health, type IntegrationAdapter } from "./types";

export type CalendarEvent = { id: string; summary: string; start: string; end: string; allDay: boolean; htmlLink?: string };

const calId = () => process.env.GOOGLE_CALENDAR_ID || "primary";

type GEvent = { id: string; summary?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };

export const googleCalendar: IntegrationAdapter<CalendarEvent[]> = {
  id: "google-calendar",
  name: "Google Calendar",
  purpose: "Shows Junior's next upcoming calendar slots on the Overview.",
  envVars: [
    ...GOOGLE_BASE_ENV,
    { name: "GOOGLE_CALENDAR_ID", required: false, description: "Calendar to read. Defaults to 'primary'." },
  ],
  setupSteps: [...GOOGLE_SETUP_STEPS, "Optional: set GOOGLE_CALENDAR_ID to read a calendar other than primary."],
  isConfigured: googleConfigured,
  async health(): Promise<Health> {
    if (!googleConfigured()) return { status: "not_configured", detail: "Not connected.", checkedAt: nowIso() };
    try {
      const c = await googleGet<{ summary: string; timeZone: string }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId())}`);
      return { status: "connected", detail: `Calendar "${c.summary}" (${c.timeZone}) reachable.`, checkedAt: nowIso() };
    } catch (e) {
      return { status: "error", detail: errorMessage(e), checkedAt: nowIso() };
    }
  },
  async fetch(): Promise<FetchResult<CalendarEvent[]>> {
    if (!googleConfigured()) return notConfigured(this.name);
    try {
      const params = new URLSearchParams({ timeMin: new Date().toISOString(), maxResults: "5", singleEvents: "true", orderBy: "startTime" });
      const j = await googleGet<{ items?: GEvent[] }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId())}/events?${params}`);
      const data = (j.items || []).map((e) => ({
        id: e.id,
        summary: e.summary || "(no title)",
        start: e.start?.dateTime || e.start?.date || "",
        end: e.end?.dateTime || e.end?.date || "",
        allDay: !e.start?.dateTime,
        htmlLink: e.htmlLink,
      }));
      return { ok: true, data, fetchedAt: nowIso() };
    } catch (e) {
      return { ok: false, reason: "error", message: errorMessage(e) };
    }
  },
};
