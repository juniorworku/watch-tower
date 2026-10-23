export type RawFile = { path: string; content: string };

export type VaultSourceInfo = {
  kind: "drive" | "snapshot";
  label: string;
  /** ISO timestamp: when the snapshot was taken, or when the live fetch happened. */
  asOf: string;
  /** Set when a live source was configured but failed and we fell back to the snapshot. */
  warning?: string;
};

export type Note = {
  path: string; // e.g. "Tasks/Foo.md"
  name: string; // basename without .md
  folder: string; // e.g. "Tasks"
  frontmatter: Record<string, unknown>;
  body: string; // markdown without frontmatter
  title: string; // first H1 or name
};

export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export type Task = Note & {
  owner: string;
  owners: string[];
  status: TaskStatus | string;
  project: string;
  due: string;
  created: string;
};

export type Vault = { notes: Note[]; source: VaultSourceInfo };
