# Workforce feature guide

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

FastAPI now owns transactional SQLite persistence. Records keep the version-1 JSON
shape for compatibility with exported Blob state. See [architecture](ARCHITECTURE.md)
for the transaction boundary and [the README](../README.md) for explicit read-only
Blob export / SQLite import instructions. The legacy Blob store is not modified.

#### Validation

`python -m pytest backend/tests` runs backend API, workflow, scoped-authentication,
storage concurrency/import, and session checks with temporary SQLite files. `npm test`
runs frontend page-render checks. Neither modifies production data. `npm run typecheck` checks TypeScript, and `npm run build`
validates the production routes. Feature references: [dashboard](https://www.agentcenter.cloud/features/agent-dashboard),
[orchestration](https://www.agentcenter.cloud/features/task-orchestration),
[monitoring](https://www.agentcenter.cloud/features/agent-monitoring), and
[multi-agent workflows](https://www.agentcenter.cloud/features/multi-agent-workflows).
