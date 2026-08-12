"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import AiPanel from "./AiPanel";
import CatalogPanel from "./CatalogPanel";
import DrawingPanel from "./DrawingPanel";
import MtoPanel from "./MtoPanel";
import PropertiesPanel from "./PropertiesPanel";
import Toolbar from "./Toolbar";
import { useAssembly } from "@/lib/assembly";
import { registerCustomDef } from "@/lib/catalog";
import { CUSTOM_STORAGE_KEY, parseCustomDefs } from "@/lib/custom";
import { parseProject, serializeProject, STORAGE_KEY } from "@/lib/project";
import { downloadText, timestamp } from "@/lib/viewer";

const NUDGE = 0.25; // arrow-key nudge step, inches

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

  // Hydrate from localStorage once, then autosave on every change (debounced).
  useEffect(() => {
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
          st.clearSelection();
          st.cancelSketch();
          st.setSplitTarget(null);
          st.clearNotice();
          st.setDrawing(null);
          st.setAiOpen(false);
          st.closePanels();
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

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-neutral-950 text-neutral-200">
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
        {/* Panels: static sidebars on desktop, slide-over drawers on mobile */}
        <aside
          className={`flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:transition-transform max-md:duration-200 ${
            panelLeft ? "max-md:translate-x-0" : "max-md:-translate-x-full"
          }`}
        >
          <CatalogPanel />
        </aside>
        <main className="relative min-w-0 flex-1 bg-neutral-950 [touch-action:none]">
          <Viewport />
        </main>
        <aside
          className={`flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-900 max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:transition-transform max-md:duration-200 ${
            panelRight ? "max-md:translate-x-0" : "max-md:translate-x-full"
          }`}
        >
          <PropertiesPanel />
        </aside>
        {/* Scrim closes the drawers (mobile only) */}
        {(panelLeft || panelRight) && (
          <button
            aria-label="Close panels"
            onClick={closePanels}
            className="absolute inset-0 z-30 bg-black/50 md:hidden"
          />
        )}
      </div>
      <MtoPanel />
      <DrawingPanel />
      <AiPanel />
    </div>
  );
}
