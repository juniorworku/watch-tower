import "server-only";
import { errorMessage, fetchJson, nowIso, notConfigured, type FetchResult, type Health, type IntegrationAdapter } from "./types";

export type SlackSummary = { team: string; botUser: string; channel?: { id: string; recent: { ts: string; text: string }[] } };

const configured = () => Boolean(process.env.SLACK_BOT_TOKEN);

async function slack<T extends { ok: boolean; error?: string }>(method: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const j = await fetchJson<T>(`https://slack.com/api/${method}${qs ? "?" + qs : ""}`, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}`);
  return j;
}

export const slackAdapter: IntegrationAdapter<SlackSummary> = {
  id: "slack",
  name: "Slack (Cosmos AI workspace)",
  purpose: "Confirms the bot can see the Cosmos AI workspace and, optionally, shows the latest messages from one channel.",
  envVars: [
    { name: "SLACK_BOT_TOKEN", required: true, description: "Bot User OAuth token (xoxb-…) of a Slack app installed in the Cosmos AI workspace.", secret: true },
    { name: "SLACK_CHANNEL_ID", required: false, description: "Optional channel id (C…) to show recent messages from. Needs channels:history and the bot invited to the channel." },
  ],
  setupSteps: [
    "Create a Slack app at https://api.slack.com/apps (From scratch) in the Cosmos AI workspace.",
    "Under OAuth & Permissions add read-only bot scopes: team:read, channels:read, and (optional) channels:history.",
    "Install the app to the workspace and copy the Bot User OAuth Token into SLACK_BOT_TOKEN.",
    "Optional: invite the bot to a channel (/invite @yourapp) and set SLACK_CHANNEL_ID.",
    "Set the variables in Vercel > Settings > Environment Variables and redeploy.",
  ],
  isConfigured: configured,
  async health(): Promise<Health> {
    if (!configured()) return { status: "not_configured", detail: "Not connected.", checkedAt: nowIso() };
    try {
      const a = await slack<{ ok: boolean; team: string; user: string }>("auth.test");
      return { status: "connected", detail: `Workspace "${a.team}" as @${a.user}.`, checkedAt: nowIso() };
    } catch (e) {
      return { status: "error", detail: errorMessage(e), checkedAt: nowIso() };
    }
  },
  async fetch(): Promise<FetchResult<SlackSummary>> {
    if (!configured()) return notConfigured(this.name);
    try {
      const a = await slack<{ ok: boolean; team: string; user: string }>("auth.test");
      const data: SlackSummary = { team: a.team, botUser: a.user };
      const ch = process.env.SLACK_CHANNEL_ID;
      if (ch) {
        const h = await slack<{ ok: boolean; messages: { ts: string; text: string }[] }>("conversations.history", { channel: ch, limit: "5" });
        data.channel = { id: ch, recent: h.messages.map((m) => ({ ts: m.ts, text: (m.text || "").slice(0, 200) })) };
      }
      return { ok: true, data, fetchedAt: nowIso() };
    } catch (e) {
      return { ok: false, reason: "error", message: errorMessage(e) };
    }
  },
};
