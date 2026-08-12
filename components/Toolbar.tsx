"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useAssembly } from "@/lib/assembly";
import { parseProject, serializeProject } from "@/lib/project";
import type { ViewMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import { downloadDataUrl, downloadText, timestamp, viewerRef } from "@/lib/viewer";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

const VIEW_MODES: { v: ViewMode; label: string }[] = [
  { v: "3d", label: "3D" },
  { v: "iso", label: "Iso" },
  { v: "top", label: "Top" },
  { v: "front", label: "Front" },
  { v: "side", label: "Side" },
];

export default function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const placed = useAssembly((s) => s.placed);
  const viewMode = useAssembly((s) => s.viewMode);
  const setViewMode = useAssembly((s) => s.setViewMode);
  const setDrawing = useAssembly((s) => s.setDrawing);
  const sketchMode = useAssembly((s) => s.sketchMode);
  const toggleSketch = useAssembly((s) => s.toggleSketch);
  const finishSketch = useAssembly((s) => s.finishSketch);
  const cancelSketch = useAssembly((s) => s.cancelSketch);
  const setAiOpen = useAssembly((s) => s.setAiOpen);
  const customDefs = useAssembly((s) => s.customDefs);
  const mergeCustomDefs = useAssembly((s) => s.mergeCustomDefs);
  const undo = useAssembly((s) => s.undo);
  const redo = useAssembly((s) => s.redo);
  const canUndo = useAssembly((s) => s.past.length > 0);
  const canRedo = useAssembly((s) => s.future.length > 0);
  const toggleLeftPanel = useAssembly((s) => s.toggleLeftPanel);
  const toggleRightPanel = useAssembly((s) => s.toggleRightPanel);
  const setCloudOpen = useAssembly((s) => s.setCloudOpen);
  const { configured, user, role } = useSession();
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
  };
  const loadProject = useAssembly((s) => s.loadProject);
  const clearAll = useAssembly((s) => s.clearAll);

  const screenshot = () => {
    const gl = viewerRef.gl;
    if (!gl) return;
    downloadDataUrl(`pipeforge-${timestamp()}.png`, gl.domElement.toDataURL("image/png"));
  };

  const save = () => {
    downloadText(
      `pipeforge-project-${timestamp()}.json`,
      serializeProject(placed, customDefs),
      "application/json",
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const parsed = parseProject(await file.text());
    if (!parsed) {
      window.alert("Not a valid PipeForge project file.");
      return;
    }
    if (parsed.customDefs.length > 0) mergeCustomDefs(parsed.customDefs);
    loadProject(parsed.placed);
  };

  const reset = () => {
    if (placed.length === 0) return;
    if (window.confirm("Remove all placed parts? This cannot be undone.")) clearAll();
  };

  return (
    <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-800 bg-neutral-900 px-4 py-2">
      <button
        onClick={toggleLeftPanel}
        className={`${btnCls} md:hidden`}
        title="Open the parts catalog"
      >
        ☰ Parts
      </button>
      <div className="mr-3">
        <span className="text-sm font-semibold tracking-wide text-neutral-100">
          Pipe<span className="text-amber-400">Forge</span>
        </span>
        <span className="ml-2 hidden text-[10px] uppercase tracking-wider text-neutral-500 sm:inline">
          3D piping designer
        </span>
      </div>

      <div
        className="flex overflow-hidden rounded border border-neutral-700"
        title="Camera view: 3D, isometric, or flat orthographic"
      >
        {VIEW_MODES.map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            className={`px-2 py-1 text-xs ${
              viewMode === v
                ? "bg-amber-950/60 text-amber-300"
                : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button onClick={screenshot} className={btnCls} title="Download a PNG of the viewport">
        PNG
      </button>
      <button
        onClick={() => setDrawing("schematic")}
        className={btnCls}
        title="2D P&ID-style schematic (SVG)"
      >
        Schematic
      </button>
      <button
        onClick={() => setDrawing("iso")}
        className={btnCls}
        title="Dimensioned isometric drawing sheet (SVG)"
      >
        Iso sheet
      </button>
      {sketchMode ? (
        <>
          <button
            onClick={finishSketch}
            className={`${btnCls} border-amber-600 bg-amber-950/60 text-amber-300`}
            title="Build the run from the clicked points"
          >
            Finish run
          </button>
          <button onClick={cancelSketch} className={btnCls}>
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={toggleSketch}
          className={btnCls}
          title="Freehand drafting: click points on the floor to route a 1/4 in ULTRON tube run"
        >
          Sketch run
        </button>
      )}
      <button
        onClick={() => setAiOpen(true)}
        className={`${btnCls} border-purple-700 bg-purple-950/50 text-purple-300`}
        title="AI designer: describe the system in words, AI builds it (bring your own API key)"
      >
        AI
      </button>

      <div className="mx-1 h-5 w-px bg-neutral-800" />

      <button onClick={undo} disabled={!canUndo} className={btnCls} title="Undo (Ctrl+Z)">
        ⟲ Undo
      </button>
      <button onClick={redo} disabled={!canRedo} className={btnCls} title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
        ⟳ Redo
      </button>

      <button onClick={save} className={btnCls} title="Save project as JSON">
        Save
      </button>
      <button onClick={() => fileRef.current?.click()} className={btnCls} title="Load project JSON">
        Load
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <button onClick={reset} disabled={placed.length === 0} className={btnCls}>
        Clear
      </button>
      {configured && (
        <button
          onClick={() => setCloudOpen(true)}
          className={btnCls}
          title="Cloud projects saved to your account"
        >
          Cloud
        </button>
      )}

      <button
        onClick={toggleRightPanel}
        className={`${btnCls} md:hidden`}
        title="Open properties"
      >
        ⚙ Props
      </button>
      <div className="flex-1" />
      <a
        href="/help"
        target="_blank"
        rel="noreferrer"
        className={btnCls}
        title="Manual & tutorials (opens in a new tab)"
      >
        Help
      </a>
      {configured &&
        (user ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span
              className="max-w-32 truncate text-xs text-neutral-400"
              title={user.email ?? ""}
            >
              {user.email}
            </span>
            {role === "admin" && (
              <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] text-amber-300">
                admin
              </span>
            )}
            <button onClick={signOut} className={btnCls}>
              Sign out
            </button>
          </span>
        ) : (
          <Link href="/login" className={btnCls}>
            Sign in
          </Link>
        ))}
      <span className="text-xs text-neutral-500">
        {placed.length} part{placed.length === 1 ? "" : "s"} placed
      </span>
    </header>
  );
}
