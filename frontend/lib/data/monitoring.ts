import type { StoreData } from "./types";

export function monitoring(store: StoreData, _now?: number) {
  if (!store.monitoring) throw new Error("Backend response is missing monitoring metrics");
  return store.monitoring;
}
