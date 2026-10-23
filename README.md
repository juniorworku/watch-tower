# Watch Tower dashboard

A private, read-only web dashboard for **Watch Tower**, Junior Worku's AI agent/bot shop. Its source of truth is the Obsidian Markdown vault (`00 Dashboard.md`, `Tasks/`, `Projects/`, `Memory/`, `Docs/`, `Templates/`). Times are shown in Addis Ababa time (EAT, UTC+3).

Next.js 15 (App Router, TypeScript) + Tailwind CSS v4. Everything is server-rendered; no secrets reach the browser.

## Pages
| Route | What it shows |
|---|---|
| `/` Overview | Bot cards (role, status derived from their tasks, last activity from daily logs), task counts, blocked items, today's log summary, next calendar slot, integration health |
| `/tasks` | Kanban (Todo / Doing / Blocked / Done) from task-note frontmatter; filter by owner and project (`?owner=Liz&project=Watch%20Tower`) |
| `/projects` | Active and archived projects with their tasks and logs |
| `/memory` | Daily-log timeline and long-term memory |
| `/docs` | Agent profiles, runbooks, changelog, run write-ups |
| `/bots` | Agent registry (bots / agents / sub-agents) with hierarchy; add/edit/remove |
| `/integrations` | Each integration's status, env vars and setup steps |
| `/vault/<path>` | Any note, rendered; `[[wikilinks]]` resolve to these in-app links (missing targets are shown dashed). Includes properties and backlinks |

## Where the vault comes from
1. **Google Drive connected** (`GOOGLE_*` set): the live vault is read from Drive folder `GOOGLE_DRIVE_VAULT_FOLDER_ID` (default `1CHIRqiewFlQF4JvzPgxXJDRSV2L-lXdl`) on request, cached 60 s. If the read fails, the app falls back to the snapshot and says so.
2. **Otherwise: bundled snapshot.** `npm run build` (prebuild) runs `scripts/snapshot-vault.mjs`, which copies `../watchtower` (or `VAULT_SOURCE_DIR`) into `content/vault/` and `content/vault-snapshot.json`. If the source folder doesn't exist (e.g. on Vercel), the committed snapshot is used as is. Every page shows a banner saying **SNAPSHOT** and the time it was taken.

To refresh the snapshot: `npm run snapshot` on a machine with the vault, then redeploy.

## Integrations (`lib/integrations/`)
Each adapter implements the same interface (`types.ts`):

```ts
interface IntegrationAdapter<T> {
  id; name; purpose; envVars; setupSteps;
  isConfigured(): boolean;      // env vars present?
  health(): Promise<Health>;    // connected | not_configured | error | snapshot
  fetch(): Promise<FetchResult<T>>; // read-only data, or a typed "not configured"/error result
}
```
Adapters are server-only (`import "server-only"`), read-only, time out after 8 s, and never throw into a page. Unconfigured ones show "Not connected" with setup steps; no placeholder or fake data is ever shown.

| Integration | Adapter | Env vars | Shows |
|---|---|---|---|
| Google Drive (vault sync) | `google-drive.ts` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, optional `GOOGLE_DRIVE_VAULT_FOLDER_ID` | Live vault instead of snapshot |
| Google Calendar | `google-calendar.ts` | same Google trio, optional `GOOGLE_CALENDAR_ID` (default `primary`) | Next 5 events; next slot on Overview |
| Gmail | `gmail.ts` | same Google trio | Inbox unread/total counts only (metadata scope) |
| Notion (reading log) | `notion.ts` | `NOTION_TOKEN`, `NOTION_READING_LOG_ID` | 5 most recent reading-log entries (database query, falls back to page blocks) |
| Slack (Cosmos AI) | `slack.ts` | `SLACK_BOT_TOKEN`, optional `SLACK_CHANNEL_ID` | Workspace check; recent messages from one channel |
| Obsidian | `obsidian.ts` | none (build-time `VAULT_SOURCE_DIR`) | Vault source and note count |

### Google setup (one token for Drive, Calendar and Gmail)
1. Google Cloud Console: enable **Drive API**, **Calendar API**, **Gmail API**.
2. OAuth consent screen (External/Testing), add Junior's account as a test user.
3. Create an OAuth client (Web application); add `https://developers.google.com/oauthplayground` as a redirect URI.
4. In the OAuth 2.0 Playground, tick "Use your own OAuth credentials", authorise `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/calendar.readonly` and `https://www.googleapis.com/auth/gmail.metadata`, then exchange for a refresh token.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` in Vercel and redeploy.

Note: refresh tokens from a consent screen left in "Testing" expire after 7 days; publish the app (it can stay unverified for personal use) for a long-lived token.

### Notion
Create an internal integration with **Read content** only, share the reading-log page/database with it (••• > Connections), set `NOTION_TOKEN` and `NOTION_READING_LOG_ID`.

### Slack
Create a Slack app in the Cosmos AI workspace with bot scopes `team:read`, `channels:read` (and `channels:history` if using `SLACK_CHANNEL_ID`), install it, set `SLACK_BOT_TOKEN`.

## Access control
- `middleware.ts` protects every UI route and session-backed write API.
- Prefer `DASHBOARD_PASSWORD_HASH` (`scrypt$<saltHex>$<hashHex>`). Generate with `node scripts/hash-password.mjs`.
- Plain `DASHBOARD_PASSWORD` remains a fallback (trimmed; one pair of surrounding quotes stripped).
- Agent machine API (`/api/agents*`) uses `Authorization: Bearer $WATCHTOWER_API_KEY` instead of the session cookie.

## Durable data (Vercel Blob)
Tasks, projects, daily logs, and the agent registry live in a private Vercel Blob object (`watchtower/store.json`), seeded once from the vault snapshot. UI writes go through `/api/tasks`, `/api/logs`, `/api/projects`, `/api/registry`.

## Agent registration API
Protected by `WATCHTOWER_API_KEY` (never commit it; store locally in `.secrets/api-key.txt`).

```bash
# List agents
curl -sS -H "Authorization: Bearer $WATCHTOWER_API_KEY" \
  https://<host>/api/agents

# Register / upsert an agent
curl -sS -X POST -H "Authorization: Bearer $WATCHTOWER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Bot","platform":"n8n","type":"bot","role":"sync","owner":"Junior"}' \
  https://<host>/api/agents

# Register a sub-agent
curl -sS -X POST -H "Authorization: Bearer $WATCHTOWER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Worker","platform":"custom","type":"sub-agent","parentId":"<parent-id>"}' \
  https://<host>/api/agents

# Heartbeat / activity
curl -sS -X POST -H "Authorization: Bearer $WATCHTOWER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"heartbeat","message":"ok"}' \
  https://<host>/api/agents/<id>/activity

curl -sS -X POST -H "Authorization: Bearer $WATCHTOWER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"activity","message":"finished nightly run"}' \
  https://<host>/api/agents/<id>/activity
```

## Develop
```bash
cp .env.example .env.local   # set DASHBOARD_PASSWORD_HASH, BLOB_READ_WRITE_TOKEN, WATCHTOWER_API_KEY
npm install
npm run dev
npm run build && npm start
```

## Deploy (Vercel)
Project: `watch-tower-dashboard`, framework Next.js. Connect a Blob store (sets `BLOB_READ_WRITE_TOKEN`). Set `DASHBOARD_PASSWORD_HASH` and `WATCHTOWER_API_KEY` for Preview and Production.
