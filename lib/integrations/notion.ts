import "server-only";
import { errorMessage, fetchJson, nowIso, notConfigured, type FetchResult, type Health, type IntegrationAdapter } from "./types";

export type ReadingItem = { id: string; title: string; url?: string; lastEdited: string };

const NOTION_VERSION = "2022-06-28";
const configured = () => Boolean(process.env.NOTION_TOKEN && process.env.NOTION_READING_LOG_ID);
const tokenOnly = () => Boolean(process.env.NOTION_TOKEN);
const headers = () => ({ Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" });
const logId = () => (process.env.NOTION_READING_LOG_ID || "").replace(/-/g, "").trim();

type NPage = { id: string; url?: string; last_edited_time: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }> };
type NBlock = { id: string; type: string; last_edited_time: string; [k: string]: unknown };

function pageTitle(p: NPage): string {
  for (const prop of Object.values(p.properties || {})) {
    if (prop.type === "title") return (prop.title || []).map((t) => t.plain_text).join("") || "(untitled)";
  }
  return "(untitled)";
}

function blockText(b: NBlock): string {
  const inner = b[b.type] as { rich_text?: { plain_text: string }[]; title?: string } | undefined;
  if (b.type === "child_page" || b.type === "child_database") return inner?.title || "";
  return (inner?.rich_text || []).map((t) => t.plain_text).join("");
}

export const notion: IntegrationAdapter<{ kind: "database" | "page"; items: ReadingItem[] }> = {
  id: "notion",
  name: "Notion (reading log)",
  purpose: "Reads Junior's reading log (a database or page) for the Morning Brief. The page is still to be identified (see the blocked task).",
  envVars: [
    { name: "NOTION_TOKEN", required: true, description: "Internal integration secret (Notion > Settings > Connections > Develop or manage integrations).", secret: true },
    { name: "NOTION_READING_LOG_ID", required: true, description: "ID of the reading log database or page (the 32-char id in its URL)." },
  ],
  setupSteps: [
    "Go to https://www.notion.so/profile/integrations and create an internal integration with 'Read content' capability only.",
    "Copy the integration secret into NOTION_TOKEN.",
    "Open the reading log in Notion, choose ••• > Connections > add the integration, so it can read that page/database.",
    "Copy the 32-character id from the reading log URL into NOTION_READING_LOG_ID.",
    "Set both in Vercel > Settings > Environment Variables and redeploy.",
  ],
  isConfigured: configured,
  async health(): Promise<Health> {
    if (!tokenOnly()) return { status: "not_configured", detail: "Not connected.", checkedAt: nowIso() };
    try {
      const me = await fetchJson<{ name?: string; bot?: { workspace_name?: string } }>("https://api.notion.com/v1/users/me", { headers: headers() });
      if (!configured()) return { status: "not_configured", detail: `Token valid (${me.bot?.workspace_name || me.name || "workspace"}) but NOTION_READING_LOG_ID is not set.`, checkedAt: nowIso() };
      return { status: "connected", detail: `Integration "${me.name || "bot"}" in ${me.bot?.workspace_name || "workspace"}.`, checkedAt: nowIso() };
    } catch (e) {
      return { status: "error", detail: errorMessage(e), checkedAt: nowIso() };
    }
  },
  async fetch() {
    if (!configured()) return notConfigured(this.name);
    try {
      try {
        const q = await fetchJson<{ results: NPage[] }>(`https://api.notion.com/v1/databases/${logId()}/query`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ page_size: 5, sorts: [{ timestamp: "last_edited_time", direction: "descending" }] }),
        });
        return { ok: true, data: { kind: "database" as const, items: q.results.map((p) => ({ id: p.id, title: pageTitle(p), url: p.url, lastEdited: p.last_edited_time })) }, fetchedAt: nowIso() };
      } catch {
        const b = await fetchJson<{ results: NBlock[] }>(`https://api.notion.com/v1/blocks/${logId()}/children?page_size=50`, { headers: headers() });
        const items = b.results.map((x) => ({ id: x.id, title: blockText(x), lastEdited: x.last_edited_time })).filter((x) => x.title).slice(-5).reverse();
        return { ok: true, data: { kind: "page" as const, items }, fetchedAt: nowIso() };
      }
    } catch (e) {
      return { ok: false, reason: "error", message: errorMessage(e) } as FetchResult<never>;
    }
  },
};
