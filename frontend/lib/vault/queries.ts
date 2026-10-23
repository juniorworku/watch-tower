import { section, str, toTask } from "./parse";
import type { Note, Task, Vault } from "./types";

const inFolder = (n: Note, folder: string) => n.folder === folder || n.folder.startsWith(folder + "/");

export function tasks(v: Vault): Task[] {
  return v.notes
    .filter((n) => n.folder === "Tasks" && str(n.frontmatter.type) === "task")
    .map(toTask)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.name.localeCompare(b.name));
}

export function projects(v: Vault) {
  const map = (n: Note, archived: boolean) => ({
    note: n,
    archived,
    status: str(n.frontmatter.status) || (archived ? "archived" : "active"),
    owner: str(n.frontmatter.owner),
    started: str(n.frontmatter.started),
  });
  const isProject = (n: Note) => str(n.frontmatter.type) === "project";
  return {
    active: v.notes.filter((n) => inFolder(n, "Projects/Active") && isProject(n)).map((n) => map(n, false)),
    archived: v.notes.filter((n) => inFolder(n, "Projects/Archive") && isProject(n)).map((n) => map(n, true)),
    archiveReadme: v.notes.find((n) => inFolder(n, "Projects/Archive") && !isProject(n)),
  };
}

export function dailyLogs(v: Vault): (Note & { date: string })[] {
  return v.notes
    .filter((n) => n.folder === "Memory/Daily" && /^\d{4}-\d{2}-\d{2}$/.test(n.name))
    .map((n) => ({ ...n, date: n.name }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const longTerm = (v: Vault) => v.notes.find((n) => n.path === "Memory/Long-term.md");
export const changelog = (v: Vault) => v.notes.find((n) => n.path === "Docs/Changelog.md");
export const runbooks = (v: Vault) => v.notes.filter((n) => inFolder(n, "Docs/Runbooks"));
export const runs = (v: Vault) => v.notes.filter((n) => inFolder(n, "Docs/Runs"));
export const templates = (v: Vault) => v.notes.filter((n) => inFolder(n, "Templates"));

export type Agent = {
  note: Note;
  name: string;
  role: string;
  owner: string;
  created: string;
  tasks: Task[];
  status: { label: string; tone: "red" | "amber" | "green" | "slate"; basis: string };
  lastActivity?: { date: string; text: string };
};

export function agents(v: Vault): Agent[] {
  const ts = tasks(v);
  const logs = dailyLogs(v);
  return v.notes
    .filter((n) => inFolder(n, "Docs/Agents"))
    .map((n) => {
      const name = str(n.frontmatter.name) || n.name;
      const aliases = [name.toLowerCase(), n.name.toLowerCase()];
      const mine = ts.filter((t) => t.owners.some((o) => aliases.includes(o.toLowerCase())));
      const open = mine.filter((t) => t.status !== "done");
      const count = (s: string) => open.filter((t) => t.status === s).length;
      let status: Agent["status"];
      if (count("blocked")) status = { label: "Blocked", tone: "red", basis: `${count("blocked")} blocked task(s)` };
      else if (count("doing")) status = { label: "Working", tone: "green", basis: `${count("doing")} task(s) in progress` };
      else if (count("todo")) status = { label: "Queued", tone: "amber", basis: `${count("todo")} task(s) to do` };
      else status = { label: "Idle", tone: "slate", basis: "no open tasks" };

      let lastActivity: Agent["lastActivity"];
      for (const log of logs) {
        const s = aliases.map((a) => section(log.body, headingFromAlias(log.body, a), 3)).find(Boolean);
        if (s) {
          const first = s.split("\n").find((l) => l.trim().startsWith("-"));
          lastActivity = { date: log.date, text: (first || s).replace(/^\s*-\s*/, "").trim() };
          break;
        }
      }
      return { note: n, name, role: str(n.frontmatter.role), owner: str(n.frontmatter.owner), created: str(n.frontmatter.created), tasks: mine, status, lastActivity };
    });
}

/** Find the actual "### X" heading text in a log that matches an agent alias (case-insensitive). */
function headingFromAlias(body: string, alias: string): string {
  const m = body.split("\n").find((l) => /^###\s+/.test(l) && l.replace(/^###\s+/, "").trim().toLowerCase() === alias);
  return m ? m.replace(/^###\s+/, "").trim() : "\u0000no-match";
}

export function findNoteByPath(v: Vault, p: string): Note | undefined {
  const target = p.replace(/\.md$/i, "").toLowerCase();
  return v.notes.find((n) => n.path.replace(/\.md$/i, "").toLowerCase() === target);
}
