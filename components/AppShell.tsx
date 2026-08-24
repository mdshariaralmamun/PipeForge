"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AiChatPanel from "./AiChatPanel";
import CatalogPanel from "./CatalogPanel";
import CloudPanel from "./CloudPanel";
import CatalogImportDialog from "./CatalogImportDialog";
import ContextMenu from "./ContextMenu";
import ReferencePanel from "./ReferencePanel";
import DrawingPanel from "./DrawingPanel";
import MtoPanel from "./MtoPanel";
import PropertiesPanel from "./PropertiesPanel";
import Toolbar from "./Toolbar";
import { useAssembly, type PanelName, type PanelZone } from "@/lib/assembly";
import { registerCustomDef } from "@/lib/catalog";
import { fetchApprovedDefs } from "@/lib/cloudCatalog";
import { CUSTOM_STORAGE_KEY, parseCustomDefs } from "@/lib/custom";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { parseProject, serializeProject, STORAGE_KEY } from "@/lib/project";
import { downloadText, timestamp } from "@/lib/viewer";

const NUDGE = 0.25; // arrow-key nudge step, inches

const PANELS: PanelName[] = ["catalog", "properties", "mto"];

function renderPanel(p: PanelName) {
  if (p === "catalog") return <CatalogPanel key="catalog" />;
  if (p === "properties") return <PropertiesPanel key="properties" />;
  if (p === "ai") return <AiChatPanel key="ai" />;
  return <MtoPanel key="mto" />;
}

// three.js crashes under SSR/prerender, so the viewport is client-only.
const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
      Loading 3D viewport…
    </div>
  ),
});

export default function AppShell() {
  const notice = useAssembly((s) => s.notice);
  const clearNotice = useAssembly((s) => s.clearNotice);
  const panelLeft = useAssembly((s) => s.panelLeft);
  const panelRight = useAssembly((s) => s.panelRight);
  const closePanels = useAssembly((s) => s.closePanels);
  const theme = useAssembly((s) => s.theme);
  const panelZones = useAssembly((s) => s.panelZones);
  const setPanelZone = useAssembly((s) => s.setPanelZone);
  const aiOpen = useAssembly((s) => s.aiOpen);
  // The AI chat palette only renders while open; the rest are always parked.
  const visible = aiOpen ? [...PANELS, "ai" as PanelName] : PANELS;
  const leftPanels = visible.filter((p) => panelZones[p] === "left");
  const rightPanels = visible.filter((p) => panelZones[p] === "right");
  const bottomPanels = visible.filter((p) => panelZones[p] === "bottom");

  // Panel drag-to-dock: while a panel header is dragged, show the three drop
  // targets (see lib/panelDrag.ts); dropping sets the panel's zone.
  const [dragPanel, setDragPanel] = useState<PanelName | null>(null);
  const [dropZone, setDropZone] = useState<PanelZone | null>(null);
  useEffect(() => {
    const onDrag = (e: Event) => {
      const detail = (e as CustomEvent<PanelName | null>).detail;
      setDragPanel(detail);
      if (!detail) setDropZone(null);
    };
    window.addEventListener("pf-panel-drag", onDrag);
    return () => window.removeEventListener("pf-panel-drag", onDrag);
  }, []);

  // Hydrate from localStorage once, then autosave on every change (debounced).
  useEffect(() => {
    try {
      const t = localStorage.getItem("pipeforge-theme");
      if (t === "light" || t === "dark") useAssembly.setState({ theme: t });
      const pz = localStorage.getItem("pipeforge-panels");
      if (pz) {
        const parsed = JSON.parse(pz) as Partial<Record<PanelName, PanelZone>>;
        useAssembly.setState((s) => ({ panelZones: { ...s.panelZones, ...parsed } }));
      }
    } catch {
      // storage unavailable
    }
    try {
      const defs = parseCustomDefs(localStorage.getItem(CUSTOM_STORAGE_KEY) ?? "");
      for (const def of defs) registerCustomDef(def);
      if (defs.length > 0) useAssembly.setState({ customDefs: defs });
    } catch {
      // storage unavailable or corrupt — no custom parts
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parseProject(raw);
        if (parsed) {
          if (parsed.customDefs.length > 0)
            useAssembly.getState().mergeCustomDefs(parsed.customDefs);
          if (parsed.placed.length > 0) useAssembly.getState().loadProject(parsed.placed);
        }
      }
    } catch {
      // storage unavailable or corrupt — start empty
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useAssembly.subscribe((state) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, serializeProject(state.placed, state.customDefs));
        } catch {
          // ignore quota/availability errors
        }
      }, 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Keyboard shortcuts (Autodesk-style). Ignored while typing in form fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      const st = useAssembly.getState();
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          st.undo();
        } else if (k === "y" || (k === "z" && e.shiftKey)) {
          e.preventDefault();
          st.redo();
        } else if (k === "s") {
          e.preventDefault();
          downloadText(
            `pipeforge-project-${timestamp()}.json`,
            serializeProject(st.placed, st.customDefs),
            "application/json",
          );
        }
        return;
      }
      if (e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "z":
          st.zoomFit();
          break;
        case "m":
          st.say(
            "Move: drag a free part with the mouse; arrow keys nudge the selected part 0.25 in (PgUp/PgDn = up/down).",
          );
          break;
        case "r":
          st.rotateSelected("y");
          break;
        case "a":
          st.autoConnectSelected();
          break;
        case "s":
          st.toggleSketch();
          break;
        case "i":
          st.setViewMode("iso");
          break;
        case "1":
          st.setViewMode("3d");
          break;
        case "2":
          st.setViewMode("iso");
          break;
        case "3":
          st.setViewMode("top");
          break;
        case "4":
          st.setViewMode("front");
          break;
        case "5":
          st.setViewMode("side");
          break;
        case "arrowleft":
          e.preventDefault();
          st.nudgeSelected(-NUDGE, 0, 0);
          break;
        case "arrowright":
          e.preventDefault();
          st.nudgeSelected(NUDGE, 0, 0);
          break;
        case "arrowup":
          e.preventDefault();
          st.nudgeSelected(0, 0, -NUDGE);
          break;
        case "arrowdown":
          e.preventDefault();
          st.nudgeSelected(0, 0, NUDGE);
          break;
        case "pageup":
          e.preventDefault();
          st.nudgeSelected(0, NUDGE, 0);
          break;
        case "pagedown":
          e.preventDefault();
          st.nudgeSelected(0, -NUDGE, 0);
          break;
        case "delete":
        case "backspace":
          st.deleteSelected();
          break;
        case "escape":
          // An in-progress move/resize drag gets cancelled and restored first;
          // only when idle does Escape clear selection/panels as usual.
          if (st.dragging || st.resizing) {
            st.cancelActiveDrag();
            break;
          }
          if (st.calibrating) {
            st.setCalibrating(false);
            break;
          }
          st.clearSelection();
          st.cancelSketch();
          st.setSplitTarget(null);
          st.clearNotice();
          st.setDrawing(null);
          st.setAiOpen(false);
          st.closePanels();
          st.closeContextMenu();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // MTO starts collapsed on small screens.
  useEffect(() => {
    if (window.innerWidth < 768 && useAssembly.getState().mtoOpen)
      useAssembly.getState().toggleMto();
  }, []);

  // Load the approved shared catalog (system parts) when Supabase is configured.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void (async () => {
      try {
        const defs = await fetchApprovedDefs();
        for (const d of defs) registerCustomDef(d);
        useAssembly.getState().setSystemDefs(defs);
      } catch {
        // offline / not configured — local catalog only
      }
    })();
  }, []);

  return (
    <div
      data-theme={theme}
      className="flex h-screen w-full flex-col overflow-hidden bg-neutral-950 text-neutral-200"
    >
      <Toolbar />
      {notice && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-900/60 bg-amber-950/70 px-4 py-1.5 text-xs text-amber-200">
          <span className="min-w-0 flex-1 truncate" title={notice}>
            {notice}
          </span>
          <button
            onClick={clearNotice}
            className="shrink-0 rounded border border-amber-800 px-1.5 py-0.5 text-[10px] hover:border-amber-500"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {/* Dock zones: panels render where the user parked them (⇄ Move). */}
        {leftPanels.length > 0 && (
          <aside
            className={`flex w-72 shrink-0 flex-col divide-y divide-neutral-800 border-r border-neutral-800 bg-neutral-900 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:transition-transform max-md:duration-200 ${
              panelLeft ? "max-md:translate-x-0" : "max-md:-translate-x-full"
            }`}
          >
            {leftPanels.map(renderPanel)}
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1 bg-neutral-950 [touch-action:none]">
            <Viewport />
            <ReferencePanel />
          </main>
          {bottomPanels.length > 0 && (
            <div className="flex max-h-72 shrink-0 divide-x divide-neutral-800 overflow-x-auto border-t border-neutral-800 bg-neutral-900">
              {bottomPanels.map((p) => (
                <div key={p} className="flex min-w-80 flex-1 flex-col overflow-hidden">
                  {renderPanel(p)}
                </div>
              ))}
            </div>
          )}
        </div>
        {rightPanels.length > 0 && (
          <aside
            className={`flex w-80 shrink-0 flex-col divide-y divide-neutral-800 border-l border-neutral-800 bg-neutral-900 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:transition-transform max-md:duration-200 ${
              panelRight ? "max-md:translate-x-0" : "max-md:translate-x-full"
            }`}
          >
            {rightPanels.map(renderPanel)}
          </aside>
        )}
        {/* Scrim closes the drawers (mobile only) */}
        {(panelLeft || panelRight) && (
          <button
            aria-label="Close panels"
            onClick={closePanels}
            className="absolute inset-0 z-30 bg-black/50 md:hidden"
          />
        )}
        {/* Panel drag-to-dock targets, visible only while a header is dragged */}
        {dragPanel &&
          (
            [
              { zone: "left" as PanelZone, cls: "inset-y-0 left-0 w-72" },
              { zone: "right" as PanelZone, cls: "inset-y-0 right-0 w-80" },
              { zone: "bottom" as PanelZone, cls: "inset-x-0 bottom-0 h-44" },
            ] as const
          ).map(({ zone, cls }) => (
            <div
              key={zone}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropZone(zone);
              }}
              onDragLeave={() => setDropZone((z) => (z === zone ? null : z))}
              onDrop={(e) => {
                e.preventDefault();
                const p = e.dataTransfer.getData("pf-panel") as PanelName | "";
                if (p) setPanelZone(p, zone);
                setDragPanel(null);
                setDropZone(null);
              }}
              className={`absolute z-40 flex items-center justify-center border-2 border-dashed text-xs font-medium ${cls} ${
                dropZone === zone
                  ? "border-amber-400 bg-amber-400/10 text-amber-200"
                  : "border-neutral-600 bg-neutral-950/40 text-neutral-400"
              }`}
            >
              Drop to dock {zone}
            </div>
          ))}
      </div>
      <DrawingPanel />
      <CloudPanel />
      <CatalogImportDialog />
      <ContextMenu />
    </div>
  );
}
