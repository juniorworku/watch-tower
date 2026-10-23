import "server-only";
import { cache } from "react";
import { backendGet } from "@/lib/api";
import type { FetchResult, Health, IntegrationInfo } from "./types";

type GmailSummary = { email: string; inboxUnread: number; inboxTotal: number };
type ReadingLog = { kind: string; items: { id: string; title: string; url?: string; lastEdited: string }[] };
type SlackSummary = { channel?: { id: string; recent: { ts: string; text: string }[] } };
type IntegrationBundle = { health: { adapter: IntegrationInfo; health: Health }[]; data: Record<string, FetchResult<unknown>> };
const bundle = cache(() => backendGet<IntegrationBundle>("/api/integrations"));
export async function allHealth() { return (await bundle()).health; }
export const gmail = { fetch: async () => (await bundle()).data.gmail as FetchResult<GmailSummary> };
export const notion = { fetch: async () => (await bundle()).data.notion as FetchResult<ReadingLog> };
export const slackAdapter = { fetch: async () => (await bundle()).data.slack as FetchResult<SlackSummary> };
