export const TZ = "Africa/Addis_Ababa";
export const TZ_LABEL = "EAT";

/** YYYY-MM-DD for "today" in Addis Ababa. */
export function todayInTz(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatDateTime(iso: string | Date | undefined | null): string {
  if (!iso) return "unknown";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return String(iso);
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${s} ${TZ_LABEL}`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "";
  // Plain YYYY-MM-DD dates from frontmatter are calendar dates; don't shift them.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
  }
  return formatDateTime(iso);
}
