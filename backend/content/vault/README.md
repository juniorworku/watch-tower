# Watch Tower

Watch Tower is Junior Worku's AI agent/bot shop: one place to see every bot's tasks, projects, memory, and docs. It is inspired by the Hermes agent workshop idea: persistent memory, skills, schedules, and a shared board.

The vault is maintained by [[Liz]], Junior's Admin & COO bot, together with the other bots listed in [[Long-term#People and bots roster|the roster]].

## Start here
- [[00 Dashboard]]: the front page (who is doing what, active tasks, blockers, shipped this week, today's log).
- [[Board]]: the Kanban board of all tasks.
- [[Logging Protocol]]: the rule every bot follows after doing any work.
- [[Long-term]]: durable memory (preferences, roster, decisions, lessons learnt).
- [[Changelog]]: dated changes to the vault and the bot shop.

## Layout
| Folder | What lives there |
|---|---|
| `00 Dashboard.md` | Front page |
| `Tasks/` | One note per task (YAML frontmatter: type, owner, status, project, due, created) plus `Board.md` |
| `Projects/Active/` | Live projects: [[Morning Brief]], [[Micro-MVP Workshop]], [[Watch Tower]] |
| `Projects/Archive/` | Finished or parked projects (empty for now) |
| `Memory/Daily/` | One log per day, `YYYY-MM-DD.md`, e.g. [[2026-10-17]] |
| `Memory/Long-term.md` | Consolidated durable facts |
| `Docs/Agents/` | One profile per bot: [[Liz]], [[Daily Brief]], [[Micro-MVP Workshop Bot]] |
| `Docs/Runbooks/` | How-to rules, starting with [[Logging Protocol]] |
| `Docs/Runs/` | One write-up per bot run (see [[Runs README]]) |
| `Docs/Changelog.md` | Dated change history |
| `Templates/` | Daily Log, Task, Project, Agent Profile, Run Write-up templates |

## How to open this vault in Obsidian
1. Install **Google Drive for desktop** and sign in with the Google account that owns this folder.
2. Wait for the `Watch Tower` folder to sync (it appears under My Drive in the Google Drive mount). For reliable offline use, right-click the folder and choose **Available offline**.
3. Install **Obsidian**, then choose **Open folder as vault** and pick the synced `Watch Tower` folder.
4. Optional: in Settings > Files and links, keep "Use [[Wikilinks]]" on (the vault uses wikilinks throughout).

### Suggested community plugins
- **Dataview**: powers the live task query on [[00 Dashboard]].
- **Kanban**: renders [[Board]] as a drag-and-drop board.
- **Templater** (optional): richer templates. The core **Templates** plugin already understands the `{{date}}` and `{{title}}` placeholders in `Templates/`; point it at the `Templates` folder in Settings > Templates.

## Ground rules
- Every file is plain Markdown so Obsidian (and any bot) can read and write it.
- Never delete history: append, strike through, or move to `Archive/` instead.
- Follow the [[Logging Protocol]].
