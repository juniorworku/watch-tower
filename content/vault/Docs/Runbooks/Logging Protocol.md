---
type: runbook
owner: Liz
created: 2026-10-17
---
# Logging Protocol

The rule every bot in [[Watch Tower]] follows. Owner: [[Liz]].

## After any piece of work
1. **Append to today's daily log**: `Memory/Daily/YYYY-MM-DD.md` (create it from `Templates/Daily Log.md` if missing).
   - Write under **your own heading** in *Changes by bot* (e.g. `### Daily Brief`).
   - Each entry: **time in Addis Ababa** (EAT, UTC+3, `HH:MM`), **what changed**, and **[[wikilinks]]** to the task, project, run, or file touched.
   - Example: `- 08:00: Delivered the [[Morning Brief]]; Reddit via X fallback. Run: [[YYYY-MM-DD Daily Brief run]]` (illustrative only)
2. **Update your task note**: set `status:` (todo | doing | blocked | done) in its frontmatter, add a dated line under `## Log`, and move its card on the [[Board]].
3. **Add to project docs**: append a dated line to the project's `## Log` in `Projects/Active/`, and add anything durable (sources, decisions).
4. For a full bot run, write a run note in `Docs/Runs/` from `Templates/Run Write-up.md` (see [[Runs README]]).
5. If the vault structure or a bot changes, add a dated entry to [[Changelog]].

## Never delete history
- Append; don't overwrite. To correct something, strike it through (`~~old~~`) and add the correction with the date.
- Finished projects move to `Projects/Archive/`; they are not deleted.

## Nightly consolidation
- Each night, [[Liz]] folds the day's log into [[Long-term]]: new preferences, roster changes, decisions, and lessons learnt, each dated.
- Daily logs stay as they are after consolidation.
- Tracked by [[Watch Tower - nightly consolidation routine]]; the shared skill is [[Watch Tower - shared logging skill]].
