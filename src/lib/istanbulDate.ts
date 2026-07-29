/** Current date in Istanbul (GMT+3), as "YYYY-MM-DD" — used to detect the
 *  midnight rollover regardless of the visitor's own device timezone. */
export function istanbulDateString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}
