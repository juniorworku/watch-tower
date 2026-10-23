import "server-only";
import { googleDrive } from "./google-drive";
import { googleCalendar } from "./google-calendar";
import { gmail } from "./gmail";
import { notion } from "./notion";
import { slackAdapter } from "./slack";
import { obsidian } from "./obsidian";
import type { Health, IntegrationAdapter } from "./types";

export const integrations: IntegrationAdapter[] = [googleDrive, notion, slackAdapter, googleCalendar, gmail, obsidian];

export async function allHealth(): Promise<{ adapter: IntegrationAdapter; health: Health }[]> {
  return Promise.all(
    integrations.map(async (adapter) => {
      try {
        return { adapter, health: await adapter.health() };
      } catch (e) {
        return { adapter, health: { status: "error" as const, detail: e instanceof Error ? e.message : "Health check failed", checkedAt: new Date().toISOString() } };
      }
    }),
  );
}

export { googleDrive, googleCalendar, gmail, notion, slackAdapter, obsidian };
