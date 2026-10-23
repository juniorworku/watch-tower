import { formatDateTime } from "@/lib/time";
import type { VaultSourceInfo } from "@/lib/vault/types";

export function SourceBanner({ source }: { source: VaultSourceInfo }) {
  if (source.kind === "drive") {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
        Vault: <b>live from Google Drive</b> · fetched {formatDateTime(source.asOf)}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
      Vault: <b>SNAPSHOT</b> taken {formatDateTime(source.asOf)} (bundled at build time; connect Google Drive for live data)
      {source.warning && <div className="mt-1 text-amber-300">{source.warning}</div>}
    </div>
  );
}
