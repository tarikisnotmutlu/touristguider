/** Bright, distinct route colors per day, cycled by index so any number of
 *  days always gets a color — Day 1 blue, Day 2 red, Day 3 orange, per spec. */
export const DAY_COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#ea580c", // orange
  "#7c3aed", // purple
  "#0d9488", // teal
  "#db2777", // pink
];

export function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}
