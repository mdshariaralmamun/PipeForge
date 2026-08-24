// Drag source for dockable panel headers (HTML5 drag-and-drop). AppShell
// listens for the window event, shows the left/right/bottom drop targets
// while a drag is active, and applies the new dock zone on drop. The ⇄ Move
// button remains as the click/touch fallback.
import type * as React from "react";
import type { PanelName } from "./assembly";

export function panelDragProps(panel: PanelName): {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
} {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("pf-panel", panel);
      e.dataTransfer.effectAllowed = "move";
      window.dispatchEvent(new CustomEvent("pf-panel-drag", { detail: panel }));
    },
    onDragEnd: () => window.dispatchEvent(new CustomEvent("pf-panel-drag", { detail: null })),
  };
}
