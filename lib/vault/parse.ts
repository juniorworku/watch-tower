import YAML from "yaml";
import type { Note, RawFile, Task } from "./types";

export function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const text = content.replace(/^\uFEFF/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  let fm: Record<string, unknown> = {};
  try {
    // Quote Obsidian template placeholders like {{date:YYYY-MM-DD}} so YAML doesn't read them as maps.
    const yamlText = m[1].replace(/:[ \t]*(\{\{[^}\n]*\}\})[ \t]*$/gm, ': "$1"');
    const parsed = YAML.parse(yamlText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fm = parsed as Record<string, unknown>;
  } catch {
    fm = {};
  }
  return { frontmatter: fm, body: text.slice(m[0].length) };
}

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function parseNote(file: RawFile): Note {
  const { frontmatter, body } = splitFrontmatter(file.content);
  const parts = file.path.split("/");
  const name = parts[parts.length - 1].replace(/\.md$/i, "");
  const folder = parts.slice(0, -1).join("/");
  const h1 = /^#\s+(.+)$/m.exec(body);
  return { path: file.path, name, folder, frontmatter, body, title: h1 ? h1[1].trim() : name };
}

export function toTask(note: Note): Task {
  const fm = note.frontmatter;
  const owner = str(fm.owner);
  return {
    ...note,
    owner,
    owners: owner.split(/\s*[\/,&]\s*/).map((s) => s.trim()).filter(Boolean),
    status: str(fm.status).toLowerCase() || "todo",
    project: str(fm.project),
    due: str(fm.due),
    created: str(fm.created),
  };
}

/** Extract the markdown under a "## Heading" (until the next heading of same or higher level). */
export function section(body: string, heading: string, level = 2): string {
  const lines = body.split(/\r?\n/);
  const hashes = "#".repeat(level);
  const start = lines.findIndex((l) => new RegExp(`^${hashes}\\s+${escapeRe(heading)}\\s*$`, "i").test(l));
  if (start === -1) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#+)\s/.exec(lines[i]);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
