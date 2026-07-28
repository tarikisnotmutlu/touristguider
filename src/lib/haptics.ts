/** Safe wrapper around navigator.vibrate — iOS Safari doesn't implement the
 *  Vibration API at all, so this must never throw there or on any browser
 *  where it's missing. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore — haptics are a nice-to-have, never worth crashing over
  }
}
