"use client";

import PanelContent from "./PanelContent";

export default function DesktopPanel() {
  return (
    <div className="hidden h-full w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white shadow-xl md:flex">
      <PanelContent />
    </div>
  );
}
