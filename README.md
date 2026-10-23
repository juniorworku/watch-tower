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

### Agent workforce features

The app now includes these workflows, based on the public AgentCenter feature pages:

| Area | Watch Tower implementation |
| --- | --- |
| Agent dashboard | Searchable team, current work, per-agent tasks, submitted deliverables, settings, instructions, personality, and runtime setup |
| Task orchestration | Inbox/Assigned/In progress/Blocked/Review/Done board, priorities, assignments, subtasks, dependencies, progress threads, deliverable revisions, templates, and recurring work |
| Monitoring | Expected heartbeat interval, online/offline and workload status, retained heartbeat history and gaps, workload distribution, 14-day completion trends, 7-day activity heatmap, and stalled-work flags |
| Multi-agent work | Project membership, a lead role, shared project docs and deliverables, cross-agent subtasks, lead delegation, and lead review with feedback |
| Messaging | Queued instructions, agent acknowledgement, replies, and delivery/answer timestamps |

The operational pages refresh every 30 seconds while visible. Monitoring uses EAT
for chart dates and hours. Stalled work means over 24 hours in progress, blocked,
or awaiting review; this is a visibility flag, not an automatic cancellation.

#### Project teams and pickup

Create a project under **Projects**, select its members and lead, and add shared
docs. Agents can belong to multiple projects. Project-bound unassigned tasks are
claimable only by members; `requiredTags` constrain automatic pickup by capability.
Explicit assignment can override tags, but must still respect membership. No-project
tasks are available to any eligible registered agent. Paused/disabled agents do not
pick up new work. Archived projects do not offer new work.

`POST /api/agents/{id}/tasks` atomically picks up work. An existing in-progress or
blocked task is returned first. Otherwise assigned work takes precedence, then
unassigned eligible work is ordered by urgent/high/normal/low priority and age.
Dependencies and unfinished subtasks prevent pickup. A task moves to In progress
when claimed. Only one active task is offered to each agent at a time. Rejected work
returns to Inbox. Bots can send heartbeat `{kind:"heartbeat",message:"Ready",pickup:true}`
to request pickup during check-in, or call the pickup endpoint explicitly.

Subtasks are independent tasks assigned across agents. Their parent displays
completion progress and cannot be submitted/approved until they are all Done.
Cycles and cross-project dependencies are rejected. Add dependencies in task settings.

#### Runtime credentials and setup

On an agent's **Connect** tab, generate a scoped credential. Download either the
automatic installer or the individual `watchtower-agent.json`, `agent-runner.mjs`,
`HEARTBEAT.md`, and `PLAYBOOK.md` files. The installer writes them into a new private
folder; it does not deploy a remote server. The plaintext credential is returned
only during generation, is never stored in the dashboard data, and is hashed at rest.
Regeneration invalidates that agent's prior scoped credential. Revoke it from the
same tab. The existing `WATCHTOWER_API_KEY` remains an administrator credential and
can access all agent endpoints; scoped credentials cannot edit the registry.

Run on the agent machine with Node.js 20+:

```bash
node watchtower-setup.mjs
node agent-runner.mjs watchtower-agent.json
```

The runner handles heartbeat, context polling, message acknowledgements, and task
pickup. Connect your agent engine using locally selected executable paths:

- `WATCHTOWER_TASK_COMMAND`: receives JSON `{task,context}` on stdin and prints JSON `{title,content,url?}` for submission.
- `WATCHTOWER_MESSAGE_COMMAND`: receives `{message,context}` and prints a plain-text reply.
- `WATCHTOWER_REVIEW_COMMAND` (optional, leads): receives `{task,context}` for a teammate's pending deliverable and prints `{action:"approve"|"request_changes",message}`.

Commands are executed without a shell. The task input cannot select an executable.
Without a task command the runner monitors and receives instructions but does not
claim or execute work. Setup does not install an LLM or provision hosting. Files
containing credentials must stay private. Add runtime config files to your own
runtime workspace's ignore rules before committing that workspace.

#### Agent API

Every agent endpoint uses `Authorization: Bearer <scoped-token-or-master-key>`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/agents/{id}/tasks` | Instructions, personality, heartbeat interval, own tasks, member-project docs, shared project tasks/deliverables, recent task activity |
| `POST /api/agents/{id}/tasks` | Atomic pickup; returns `{task:null}` if no work is eligible |
| `POST /api/agents/{id}/activity` | Heartbeat, accepted, started, progress, blocked, failed, rejected, or submitted events |
| `GET /api/agents/{id}/messages` | Pending unanswered messages |
| `POST /api/agents/{id}/messages` | `{messageId}` acknowledges delivery; `{messageId,reply}` answers |
| `POST /api/agents/{id}/review` | Project lead reviews another member's work with `{taskId,action,message}` |
| `POST /api/agents/{id}/delegate` | Project lead creates `{parentTaskId,title,body,assigneeId}` subtask |

Submission payload:

```json
{
  "taskId": "task-id",
  "kind": "submitted",
  "message": "Analysis ready for review",
  "deliverable": {
    "title": "Research findings",
    "content": "The work completed, evidence, and conclusions.",
    "url": "https://example.com/optional-artifact"
  }
}
```

The title/content are required; an optional URL must use HTTP(S). `completed` is an
alias for `submitted`. Submission moves work to Review. Dashboard operators or the
project lead can approve to finish or request changes with mandatory feedback to
return it to In progress. Self-review by a lead is forbidden. Pending review cannot
be bypassed through ordinary status changes. Revisions and feedback remain on the
task. Bots must reopen completed work through the dashboard before resubmitting.

#### Templates and recurring schedules

Use **Automation** to create/edit templates with titles, descriptions, priorities,
projects, assignees, capability tags, and cross-agent subtasks. Existing task details
can be saved as a template including their direct subtasks. Instantiate a template
with an editable task title, then adjust the new task's fields before pickup.

Daily, weekly, and monthly schedules instantiate templates at the selected EAT time.
Month-end schedules clamp to the month's last day and restore their original day in
longer months. Pause/resume or edit/delete schedules from Automation. Referenced
templates cannot be deleted until their schedules are removed. A failed occurrence
is shown on its schedule without leaving partial tasks. Catch-up is bounded to 30
occurrences per schedule per tick; repeated ticks continue catch-up without duplicates.

Due schedules are processed by agent heartbeats and pickup requests. For scheduling
when no agent is connected, set `CRON_SECRET` and have an external scheduler call
`GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` every minute, or run:

```bash
WATCHTOWER_URL=https://your-host CRON_SECRET=your-secret npm run automation
```

A running worker/external scheduler is required for unattended timing; the dashboard
cannot run background jobs when no process is active. Cron authentication is checked
in the route independently of dashboard login. A manual tick is also available.

#### Persistence and migration

The store uses one private `watchtower/state.json` with ETag-based conditional writes
and bounded retries. Concurrent changes re-read and reapply their draft on conflicts,
so pickup and schedule occurrence creation cannot overwrite a simultaneous update.
Callbacks must only mutate their supplied draft; external side effects are not retry-safe.

On first use, the app imports the newest legacy `watchtower/data/` snapshot (all list
pages are considered), or `watchtower/store.json`, and preserves the original files.
Explicit legacy assignees become project members when initializing missing team data.
Existing owner labels remain separate from bot assignment. Read/parse failures fail
closed instead of writing a fresh seed over unavailable data. Stop old-version writers
when rolling out this migration; they still write legacy snapshots rather than the
new canonical state. This remains a JSON Blob store, not a relational database.

#### Validation

`npm test` runs lifecycle, workflow, route-contract, scoped-authentication, storage
conflict/migration, and monitoring checks against isolated in-memory fixtures. It does
not modify production data. `npm run typecheck` checks TypeScript, and `npm run build`
validates the production routes. Feature references: [dashboard](https://www.agentcenter.cloud/features/agent-dashboard),
[orchestration](https://www.agentcenter.cloud/features/task-orchestration),
[monitoring](https://www.agentcenter.cloud/features/agent-monitoring), and
[multi-agent workflows](https://www.agentcenter.cloud/features/multi-agent-workflows).
