/** Deterministic placeholder photo — we don't have a real photo API wired up
 *  (no key, no budget for one), so every card gets a stable, real-looking
 *  image seeded by its own id rather than a generic icon tile. */
export function thumbnailUrl(seed: string, size = 200): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}
