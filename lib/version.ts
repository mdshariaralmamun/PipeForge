// Build-time app version info, injected by next.config.ts env. Both values are
// inlined at build time and identical on server and client, so they are safe to
// render during SSR (formatted in UTC — no hydration mismatch).
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
export const APP_BUILD_TIME = process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? "";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-08-22T14:35:00.000Z" -> "Aug 22, 2026 · 14:35 UTC" (deterministic UTC).
export function formatBuildTime(iso: string = APP_BUILD_TIME): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}
