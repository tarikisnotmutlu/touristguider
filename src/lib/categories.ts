export type PlaceCategory =
  | "mosque"
  | "church"
  | "museum"
  | "restaurant"
  | "cafe"
  | "bar"
  | "hotel"
  | "shop"
  | "park"
  | "viewpoint"
  | "beach"
  | "attraction"
  | "other";

export const CATEGORY_ICON: Record<PlaceCategory, string> = {
  mosque: "🕌",
  church: "⛪",
  museum: "🏛️",
  restaurant: "🍽️",
  cafe: "☕",
  bar: "🍸",
  hotel: "🏨",
  shop: "🛍️",
  park: "🌳",
  viewpoint: "👁️",
  beach: "🏖️",
  attraction: "🎡",
  other: "📍",
};

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  mosque: "Mosque",
  church: "Church",
  museum: "Museum",
  restaurant: "Restaurant",
  cafe: "Cafe",
  bar: "Bar",
  hotel: "Hotel",
  shop: "Shop",
  park: "Park",
  viewpoint: "Viewpoint",
  beach: "Beach",
  attraction: "Attraction",
  other: "Place",
};

export const CATEGORY_COLOR: Record<PlaceCategory, string> = {
  mosque: "#0f766e",
  church: "#7c3aed",
  museum: "#b45309",
  restaurant: "#dc2626",
  cafe: "#92400e",
  bar: "#9333ea",
  hotel: "#2563eb",
  shop: "#db2777",
  park: "#16a34a",
  viewpoint: "#0891b2",
  beach: "#eab308",
  attraction: "#ea580c",
  other: "#4f46e5",
};

export const ALL_CATEGORIES: PlaceCategory[] = [
  "mosque",
  "church",
  "museum",
  "attraction",
  "viewpoint",
  "park",
  "beach",
  "restaurant",
  "cafe",
  "bar",
  "hotel",
  "shop",
  "other",
];

/**
 * Best-effort guess from Nominatim's `class`/`type` fields (jsonv2 search
 * results). Never blocking — always falls back to "other", and the user can
 * override it with the category picker.
 */
export function inferCategoryFromNominatim(
  nominatimClass: string | undefined,
  nominatimType: string | undefined
): PlaceCategory {
  const cls = (nominatimClass ?? "").toLowerCase();
  const type = (nominatimType ?? "").toLowerCase();

  if (type === "mosque" || (cls === "amenity" && type === "place_of_worship")) {
    // Nominatim doesn't reliably expose religion in jsonv2 search results, so
    // place_of_worship defaults to the more common case; mosque wins if the
    // type itself says so.
    return type.includes("mosque") ? "mosque" : type.includes("church") ? "church" : "mosque";
  }
  if (type === "church") return "church";
  if (cls === "tourism" && type === "museum") return "museum";
  if (cls === "tourism" && type === "hotel") return "hotel";
  if (cls === "amenity" && (type === "hotel" || type === "hostel")) return "hotel";
  if (cls === "tourism" && type === "viewpoint") return "viewpoint";
  if (cls === "tourism" && (type === "attraction" || type === "artwork" || type === "gallery"))
    return "attraction";
  if (cls === "historic") return "attraction";
  if (cls === "leisure" && (type === "park" || type === "garden")) return "park";
  if (cls === "natural" && type === "beach") return "beach";
  if (cls === "amenity" && type === "restaurant") return "restaurant";
  if (cls === "amenity" && (type === "cafe" || type === "fast_food")) return "cafe";
  if (cls === "amenity" && (type === "bar" || type === "pub")) return "bar";
  if (cls === "shop") return "shop";
  return "other";
}
