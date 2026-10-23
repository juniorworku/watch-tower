---
type: dashboard
updated: 2026-10-17
---
# Watch Tower Dashboard

> Front page of Junior's bot shop. Maintained by [[Liz]]. See [[README]] for how the vault works.

## Bots and what each is doing now
| Bot | Role | Doing now |
|---|---|---|
| [[Liz]] | Admin & COO, orchestrator | Setting up Watch Tower: this vault, [[Watch Tower - shared logging skill]], [[Watch Tower - nightly consolidation routine]]; [[Morning Brief - xurl X timeline auth]] queued |
| [[Daily Brief]] | Morning Brief producer | Scheduled daily at 8:00 AM (Addis Ababa). Blocked on [[Morning Brief - Notion reading log hookup]] |
| [[Micro-MVP Workshop Bot]] | Runs the [[Micro-MVP Workshop]] pipeline | Waiting on Junior's first idea: [[Micro-MVP Workshop - first pain point]] |

## Active tasks
- [[Morning Brief - Notion reading log hookup]] (blocked, [[Daily Brief]] / [[Liz]])
- [[Morning Brief - xurl X timeline auth]] (todo, [[Liz]])
- [[Micro-MVP Workshop - first pain point]] (todo, [[Micro-MVP Workshop Bot]])
- [[Watch Tower - shared logging skill]] (todo, [[Liz]])
- [[Watch Tower - nightly consolidation routine]] (todo, [[Liz]])

Full board: [[Board]]

## Stuck / blocked
- [[Morning Brief - Notion reading log hookup]]: waiting on Junior to share the Notion reading log page name.
- [[Micro-MVP Workshop - first pain point]]: waiting on Junior's first idea (todo, not yet started).

## Shipped this week
- 2026-10-17: Liz set up (British COO persona); Gmail, Google Calendar, Drive, Slack (Cosmos AI workspace) and Notion connected.
- 2026-10-17: [[Daily Brief]] teammate created; [[Morning Brief]] routine scheduled daily at 8:00 AM; first brief delivered by hand.
- 2026-10-17: [[Micro-MVP Workshop Bot]] teammate created and corrected to a general pipeline.
- 2026-10-17: Watch Tower vault created in Google Drive.

## Today's log
- [[2026-10-17]]

## Projects
- Active: [[Morning Brief]], [[Micro-MVP Workshop]], [[Watch Tower]]
- Archive: none yet

## Live task query (optional)
Requires the **Dataview** community plugin. Without it, this block shows as plain code.

```dataview
TABLE owner, status, project, due
FROM "Tasks"
WHERE type = "task" AND status != "done"
SORT status ASC, due ASC
```
