import type { Note } from "./types";

export function noteHref(path: string): string {
  return "/vault/" + path.replace(/\.md$/i, "").split("/").map(encodeURIComponent).join("/");
}

export type LinkIndex = Map<string, Note>;

export function buildLinkIndex(notes: Note[]): LinkIndex {
  const idx: LinkIndex = new Map();
  // Templates last so real notes win on name collisions.
  const ordered = [...notes].sort((a, b) => Number(a.folder.startsWith("Templates")) - Number(b.folder.startsWith("Templates")));
  for (const n of ordered) {
    const byPath = n.path.replace(/\.md$/i, "").toLowerCase();
    if (!idx.has(byPath)) idx.set(byPath, n);
    const byName = n.name.toLowerCase();
    if (!idx.has(byName)) idx.set(byName, n);
  }
  return idx;
}

export function resolveWikilink(idx: LinkIndex, target: string): Note | undefined {
  const t = target.trim().replace(/\.md$/i, "").toLowerCase();
  return idx.get(t) ?? idx.get(t.split("/").pop() || t);
}

export function slugifyHeading(h: string): string {
  return h.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
}
