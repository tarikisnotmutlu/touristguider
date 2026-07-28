"use client";

import PanelContent from "./PanelContent";

export default function DesktopPanel() {
  return (
    <div className="glass-panel hidden h-full w-[400px] shrink-0 flex-col shadow-2xl lg:flex">
      <PanelContent />
    </div>
  );
}
