import "server-only";
import { cache } from "react";
import { backendGet } from "@/lib/api";
import { parseNote } from "./parse";
import type { RawFile, Vault, VaultSourceInfo } from "./types";

/** Fetching and credentials live in FastAPI; Markdown presentation stays in Next.js. */
export const getVault = cache(async (): Promise<Vault> => {
  const value = await backendGet<{ files: RawFile[]; source: VaultSourceInfo }>("/api/vault");
  return { notes: value.files.map(parseNote), source: value.source };
});
