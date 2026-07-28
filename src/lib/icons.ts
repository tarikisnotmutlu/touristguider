import L from "leaflet";

export function stepDivIcon(index: number, color = "#4f46e5"): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="tg-step-marker" style="background:${color}">${index}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function startDivIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="tg-start-marker">🏁</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function viaDivIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="tg-via-marker"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}
