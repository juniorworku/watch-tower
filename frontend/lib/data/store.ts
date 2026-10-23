import "server-only";
import { cache } from "react";
import { backendGet } from "@/lib/api";
import type { StoreData } from "./types";

/** Read-only frontend API adapter. FastAPI owns all writes and persistence. */
export const loadStore = () => backendGet<StoreData>("/api/state");
export const getStore = cache(loadStore);
