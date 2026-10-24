# Telegram, WhatsApp and Slack agents

Watch Tower registers your agents, assigns and reassigns tasks, records progress,
collects deliverables for review, and exchanges messages through a connected
channel. Each agent can have one channel; create separate agent records for
separate bots. Bot accounts, apps and business numbers are created with their
providers. Your agent runtime or automation performs the actual work and can
continue using its existing scoped Watch Tower API credential.

## Connect an agent

1. Open **Agents → Create an agent** and choose Telegram, WhatsApp or Slack.
   You are taken to its **Connect** tab after creation. Existing agents can also
   connect from that tab.
2. Add the provider's credentials to backend environment variables with names
   beginning `BOT_`, for example `BOT_RESEARCH_TOKEN` and `BOT_RESEARCH_SECRET`.
   Enter **the variable names**, never credential values, into the connection form.
   Use different names for each bot. The database stores references and routing
   metadata, not the credential values.
3. Set the destination and allowed sender IDs. Only verified events from that
   chat/channel/account and those senders may update the agent's tasks.
4. Save the connection. The screen lists missing variables and gives the public
   webhook URL. “Configured” means the values exist, not that the provider has
   accepted a message. Check delivery history and last verified inbound activity.
5. Register that webhook in the provider, send `/heartbeat` from an allowed sender,
   assign a task, and check its notification and delivery state.

For Docker, put values in the existing `backend/.env.docker`, then run
`docker compose up -d --build`. For local Python, use `backend/.env` and restart
FastAPI. On Vercel, add Production environment variables and redeploy. Keep
`PUBLIC_APP_URL` set to your public HTTPS origin. Localhost cannot receive provider
webhooks; use a public test HTTPS endpoint for local development.

## Platform setup

| Platform | Destination | Token variable contains | Secret variable contains | Extra setup |
| --- | --- | --- | --- | --- |
| Telegram | Numeric chat ID, including minus sign for a group | BotFather bot token | Chosen webhook `secret_token` | Allow numeric Telegram sender user IDs. Set webhook to the displayed URL using `setWebhook` and the same `secret_token`; start a conversation with the bot first. |
| Slack | Channel or DM ID (`C…`, `G…`, `D…`) | Bot OAuth token | Slack app signing secret | Set workspace ID (`T…`), allow user/bot IDs, invite app to the channel, grant `chat:write` plus the history scopes needed for subscribed message events. Configure the displayed URL under Events API; subscribe to relevant message events or app mentions. |
| WhatsApp | Recipient phone number with country code, digits only | WhatsApp Business Cloud API access token | Meta app secret | Set phone-number ID, a currently supported Graph API version from your Meta app, and a separate `BOT_` verification-token variable. Subscribe the Meta callback to messages/status events. Allowed sender must equal recipient number. |

Telegram cannot deliver bot-to-bot messages. Use the agent API to connect the
work runtime and Telegram to communicate with its human-facing chat. Telegram
also supports one active webhook per bot: when a bot already has a runtime
webhook, integrate the Watch Tower agent API into that runtime or forward its
verified updates rather than replacing the existing webhook accidentally.
[Telegram Bot FAQ](https://core.telegram.org/bots/faq),
[Telegram Bot API](https://core.telegram.org/bots/api).

Slack validates the raw request signature and rejects timestamps outside five
minutes. Events from the wrong workspace/channel or unapproved senders are ignored.
The receiving bot's own messages are ignored when Slack supplies its authorization
identity, preventing notification echoes from creating activity.
[Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/),
[Events API](https://docs.slack.dev/apis/events-api/),
[chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/).

WhatsApp uses the Business Cloud API, not a personal WhatsApp session. Text delivery
uses a recent inbound conversation window. Outside 24 hours, this adapter requires
an approved template with exactly one body text parameter and the configured
language. Other template structures, media and attachments are not supported by
this version. Set a supported API version explicitly; the app does not guess one.
[WhatsApp conversation window](https://whatsappbusiness.com/policy/?faq=5),
[Meta message request](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message),
[Meta template example](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/),
[Meta webhook verification](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/).

## Assign, monitor, review and communicate

- Assign tasks from the board. Assignment, reassignment, operator status/comment
  updates, approval and change requests enqueue notifications for connected agents.
- Follow assigned/active/blocked/review work and last seen on agent pages. Filter the
  agent list by platform; channel delivery problems appear on agent cards.
- Open **Messages**, choose an agent and send text. Incoming verified messages appear
  in the conversation. Use `/reply MESSAGE_ID text` or a native provider reply to
  correlate a reply to an outgoing message. Slack thread replies use its thread ID.
- Use **Connect → Delivery queue** to inspect the latest 100 deliveries and all-state
  counts, refresh, send pending work, retry failures, or disconnect.
- A channel message updates last activity; an explicit `/heartbeat` updates heartbeat.
  A provider's successful send proves API acceptance, not bot execution or completion.

Supported commands from an allowed sender:

```text
/help
/heartbeat
/accept TASK_ID
/start TASK_ID
/progress TASK_ID summary
/block TASK_ID reason
/reject TASK_ID reason
/submit TASK_ID deliverable title | deliverable content
/reply MESSAGE_ID reply text
```

In Slack, mention the app before the command, for example
`@WatchTower /start TASK_ID`, so the message is delivered as an event instead of
being interpreted as an unregistered Slack slash command. Slash-command form
payloads and interactive buttons are not implemented.

Commands apply only to tasks currently assigned to this agent and preserve task
dependencies and exclusive active-work rules. Submission moves work to **Review**;
operators approve or request changes in the existing task page. Chat commands do
not approve work. Replayed provider event IDs are deduplicated transactionally.
Unrecognized commands and invalid transitions are recorded as rejected receipts;
providers receive an acknowledgment so they do not keep retrying permanent errors.

## Delivery workers and reliability

API writes schedule a best-effort background dispatch after committing the task or
message, keeping network calls outside database locks. The outbox is durable.
Docker Compose also runs `channel-worker`, which polls every five seconds and
recovers queued work. For local Python, run it in another terminal:

```bash
.venv/bin/python -m backend.app.channel_worker
```

On hosted/container platforms, background execution alone is not a durable
scheduler. Configure an external scheduler to call `GET /api/cron` every minute
with `Authorization: Bearer <CRON_SECRET>`; the endpoint runs recurring tasks and
channel delivery. Keep that secret in the scheduler's secret store. No provider
subscription or scheduler is silently provisioned by this app. The dashboard's
**Send pending messages** control also triggers dispatch explicitly.

Claims use a database lease so workers cannot send the same row concurrently.
Rate limits obey Retry-After (up to five attempts). A network timeout, ambiguous
provider error or worker interruption becomes **unknown**, not an automatic resend.
Check the actual conversation before explicitly retrying an unknown outcome;
providers do not all offer an idempotency key, so exactly-once external delivery
cannot be guaranteed. Changing/removing a connection cancels unsent deliveries
for its previous destination. An already in-flight delivery can still finish.

**Sent** means provider accepted the message. WhatsApp signed status callbacks can
add **Delivered**, **Read** or failure; Telegram/Slack have no read receipts here.
Long text is split into bounded messages. Provider error bodies and token-bearing
URLs are not returned or stored. Configure log redaction in any external HTTP
instrumentation before enabling verbose provider request logging (Telegram tokens
are part of its API URL).

## Verification and scope

The tests use mocked provider APIs, signed fixture webhooks and transactional
SQLite/PostgreSQL tests. Real provider delivery needs your own account credentials,
permissions and webhook subscriptions; no external bot account is created during
implementation. Existing bot runtimes can continue polling their scoped agent APIs.
