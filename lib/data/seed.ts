import "server-only";
import snapshot from "@/content/vault-snapshot.json";
import { parseNote, section, str, toTask } from "@/lib/vault/parse";
import type { RawFile } from "@/lib/vault/types";
import type { AgentItem, LogEntry, ProjectItem, StoreData, TaskItem, TaskStatus } from "./types";

const SEED_AGENTS: Omit<AgentItem, "createdAt" | "updatedAt" | "lastHeartbeat" | "lastActivity" | "lastActivityText">[] = [
  {
    id: "liz-admin-coo",
    name: "Liz",
    platform: "Grok Bot",
    type: "agent",
    parentId: null,
    role: "Admin & COO",
    owner: "Junior Worku",
    status: "active",
    url: "",
    webhook: "",
    tags: ["orchestrator", "cosmos"],
  },
  {
    id: "04ec2749-2259-46de-a6b0-de796e045582",
    name: "Daily Brief",
    platform: "Grok Bot",
    type: "bot",
    parentId: "liz-admin-coo",
    role: "Morning Brief producer",
    owner: "Junior Worku",
    status: "active",
    url: "",
    webhook: "",
    tags: ["morning-brief"],
  },
  {
    id: "b6190cf7-749c-4463-9ef2-ac79ed8437f5",
    name: "Micro-MVP Workshop",
    platform: "Grok Bot",
    type: "bot",
    parentId: "liz-admin-coo",
    role: "Micro-MVP pipeline runner",
    owner: "Junior Worku",
    status: "active",
    url: "",
    webhook: "",
    tags: ["mvp", "pipeline"],
  },
];

function slugId(prefix: string, name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${s}`;
}

export function buildSeedStore(): StoreData {
  const now = new Date().toISOString();
  const notes = (snapshot.files as RawFile[])
    .filter((f) => !f.path.startsWith("Templates/"))
    .map(parseNote);

  const tasks: TaskItem[] = notes
    .filter((n) => n.folder === "Tasks" && str(n.frontmatter.type) === "task")
    .map((n) => {
      const t = toTask(n);
      const status = (["todo", "doing", "blocked", "done"].includes(t.status) ? t.status : "todo") as TaskStatus;
      return {
        id: slugId("task", n.name),
        title: t.title,
        status,
        owners: t.owners,
        project: t.project,
        due: t.due,
        body: t.body,
        createdAt: t.created || now,
        updatedAt: now,
      };
    });

  const projects: ProjectItem[] = [];
  for (const n of notes) {
    if (str(n.frontmatter.type) !== "project") continue;
    const archived = n.folder.startsWith("Projects/Archive");
    projects.push({
      id: slugId("proj", n.name),
      name: n.title,
      status: str(n.frontmatter.status) || (archived ? "archived" : "active"),
      archived,
      owner: str(n.frontmatter.owner),
      started: str(n.frontmatter.started),
      body: n.body,
      createdAt: now,
      updatedAt: now,
    });
  }

  const logs: LogEntry[] = notes
    .filter((n) => n.folder === "Memory/Daily" && /^\d{4}-\d{2}-\d{2}$/.test(n.name))
    .map((n) => ({
      id: `log-${n.name}`,
      date: n.name,
      body: n.body,
      createdAt: now,
      updatedAt: now,
    }));

  const agents: AgentItem[] = SEED_AGENTS.map((a) => ({
    ...a,
    createdAt: now,
    updatedAt: now,
    lastHeartbeat: null,
    lastActivity: null,
    lastActivityText: null,
  }));

  // Enrich last activity from daily logs if present
  for (const a of agents) {
    for (const log of logs.sort((x, y) => y.date.localeCompare(x.date))) {
      const heading = section(log.body, a.name, 3);
      if (heading) {
        const first = heading.split("\n").find((l) => l.trim().startsWith("-"));
        a.lastActivity = log.date;
        a.lastActivityText = (first || heading).replace(/^\s*-\s*/, "").trim().slice(0, 280);
        break;
      }
    }
  }

  return {
    version: 1,
    seededAt: now,
    updatedAt: now,
    tasks,
    projects,
    logs,
    agents,
    activities: [],
  };
}
