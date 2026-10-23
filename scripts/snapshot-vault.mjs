// Copies the Obsidian vault into content/vault and writes content/vault-snapshot.json
// (all Markdown files + metadata), which the app bundles as its offline snapshot.
// Source dir: VAULT_SOURCE_DIR, else ../watchtower. If the source is missing
// (e.g. on Vercel), the committed snapshot is kept as-is.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.resolve(process.env.VAULT_SOURCE_DIR || path.join(root, "..", "watchtower"));
const destDir = path.join(root, "content", "vault");
const jsonOut = path.join(root, "content", "vault-snapshot.json");

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // skip .obsidian, .trash, etc.
    if (entry.name === "Templates") continue; // templates are not runtime content
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
  if (fs.existsSync(jsonOut)) {
    console.log(`[snapshot] Vault source ${src} not found; keeping existing bundled snapshot.`);
    process.exit(0);
  }
  console.error(`[snapshot] Vault source ${src} not found and no bundled snapshot exists.`);
  process.exit(1);
}

const files = walk(src).sort();
fs.rmSync(destDir, { recursive: true, force: true });
const snapshot = { takenAt: new Date().toISOString(), sourceLabel: "Bundled vault snapshot", files: [] };
for (const rel of files) {
  const content = fs.readFileSync(path.join(src, rel), "utf8");
  const target = path.join(destDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  snapshot.files.push({ path: rel, content });
}
fs.writeFileSync(jsonOut, JSON.stringify(snapshot, null, 1));
console.log(`[snapshot] Copied ${files.length} notes from ${src} at ${snapshot.takenAt}.`);
