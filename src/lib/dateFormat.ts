/** Parses a "YYYY-MM-DD" string as a local-time date (avoids the classic
 *  off-by-one-day bug from letting `new Date("YYYY-MM-DD")` treat it as UTC). */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const SHORT = { month: "short", day: "numeric" } as const;

export function formatDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const startLabel = sameMonth
      ? start.toLocaleDateString(undefined, { day: "numeric" })
      : start.toLocaleDateString(undefined, SHORT);
    return `${startLabel} – ${end.toLocaleDateString(undefined, SHORT)}`;
  }
  const only = parseLocalDate(startDate ?? endDate!);
  return only.toLocaleDateString(undefined, SHORT);
}
