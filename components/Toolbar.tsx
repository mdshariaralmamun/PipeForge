"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { getDef } from "@/lib/catalog";
import { buildDxf } from "@/lib/dxf";
import { buildIfc } from "@/lib/ifc";
import { buildPdf } from "@/lib/pdf";
import { collectCenterlines, collectPartGeometry, labelParts } from "@/lib/export3d";
import { parseCatalogPdf } from "@/lib/pdfCatalog";
import { parseDxfUnderlay } from "@/lib/dxfImport";
import { rasterizePdfPage } from "@/lib/reference";
import { parseProject, serializeProject } from "@/lib/project";
import type { ViewMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";
import { downloadBlob, downloadDataUrl, downloadText, timestamp, viewerRef } from "@/lib/viewer";
import { APP_VERSION, formatBuildTime } from "@/lib/version";

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
  const theme = useAssembly((s) => s.theme);
  const toggleTheme = useAssembly((s) => s.toggleTheme);
  const { configured, user, role } = useSession();
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
  };
  const loadProject = useAssembly((s) => s.loadProject);
  const clearAll = useAssembly((s) => s.clearAll);
  const say = useAssembly((s) => s.say);

  const screenshot = () => {
    const gl = viewerRef.gl;
    if (!gl) return;
    downloadDataUrl(`pipeforge-${timestamp()}.png`, gl.domElement.toDataURL("image/png"));
  };

  // Dropdown state: the menus are position:fixed (anchored to the button
  // rect) because the header is a scroll container — an absolutely positioned
  // dropdown gets clipped behind the viewport below it.
  const [exportPos, setExportPos] = useState<{ x: number; y: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [importPos, setImportPos] = useState<{ x: number; y: number } | null>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const catalogFileRef = useRef<HTMLInputElement>(null);
  const dxfFileRef = useRef<HTMLInputElement>(null);
  const pdfDrawFileRef = useRef<HTMLInputElement>(null);
  const setCatalogImport = useAssembly((s) => s.setCatalogImport);
  const setReference = useAssembly((s) => s.setReference);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setExportPos(null);
      if (importRef.current && !importRef.current.contains(e.target as Node))
        setImportPos(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Anchor point for a dropdown under its button, kept inside the viewport.
  const menuPos = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(8, Math.min(r.left, window.innerWidth - 264)), y: r.bottom + 4 };
  };
  const toggleExport = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Read the rect eagerly — e.currentTarget is null by the time a state
    // updater runs during the next render.
    const pos = menuPos(e.currentTarget);
    setExportPos((p) => (p ? null : pos));
  };
  const toggleImport = (e: React.MouseEvent<HTMLButtonElement>) => {
    const pos = menuPos(e.currentTarget);
    setImportPos((p) => (p ? null : pos));
  };

  // §5: PDF catalog → parse → review dialog (only approved rows become parts).
  const onCatalogFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    say(`Parsing "${file.name}"…`);
    const result = await parseCatalogPdf(await file.arrayBuffer());
    setCatalogImport({
      open: true,
      drafts: result.drafts,
      message: result.status === "ok" ? null : (result.message ?? "Nothing importable found."),
      pages: result.pages,
    });
  };

  // §6: DXF drawing → locked reference underlay (fit to ~40 in wide).
  const onDxfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const parsed = parseDxfUnderlay(await file.text());
    if (!parsed) {
      say(`No readable 2D geometry (LINE / POLYLINE / ARC / CIRCLE) found in "${file.name}".`);
      return;
    }
    const w = parsed.bounds.maxX - parsed.bounds.minX;
    const scale = w > 1e-9 ? 40 / w : 1;
    const cx = (parsed.bounds.minX + parsed.bounds.maxX) / 2;
    const cy = (parsed.bounds.minY + parsed.bounds.maxY) / 2;
    setReference({
      kind: "dxf",
      name: file.name,
      polylines: parsed.polylines,
      scale,
      offset: [-cx * scale, cy * scale], // bbox centered at the origin
      visible: true,
    });
    say(
      `Underlay "${file.name}": ${parsed.polylines.length} polylines` +
        (parsed.skipped > 0 ? ` (${parsed.skipped} entities skipped)` : "") +
        ". Calibrate its scale with two points if needed.",
    );
  };

  // §6: PDF drawing → page 1 rasterized onto the locked underlay.
  const onPdfDrawFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    say(`Rendering "${file.name}"…`);
    try {
      const img = await rasterizePdfPage(await file.arrayBuffer(), 150);
      const scale = 40 / img.w; // initial guess: page ≈ 40 in wide
      setReference({
        kind: "pdf",
        name: file.name,
        image: img.dataUrl,
        imgW: img.w,
        imgH: img.h,
        scale,
        offset: [(-img.w * scale) / 2, (img.h * scale) / 2], // centered at origin
        visible: true,
      });
      say(`Underlay "${file.name}" placed — use "Calibrate scale (2 points)" to set its true scale.`);
    } catch (err) {
      say(`Could not render the PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // DWG underlay: same flagged conversion path as DWG export (no native support).
  const onDwgUnderlay = () =>
    say(
      "DWG can't be read directly (closed format): convert it to DXF with the free ODA File Converter, then Import → DXF drawing.",
    );

  const onImportItem = (id: string) => {
    setImportPos(null);
    if (id === "catalog") catalogFileRef.current?.click();
    else if (id === "dxf") dxfFileRef.current?.click();
    else if (id === "pdf") pdfDrawFileRef.current?.click();
    else onDwgUnderlay();
  };

  // Shared export payload: world-space part triangles + centerline skeletons.
  const gather = () => {
    const scene = viewerRef.scene;
    if (!scene || placed.length === 0) return null;
    return {
      parts: labelParts(collectPartGeometry(scene), placed),
      centers: collectCenterlines(placed),
    };
  };

  const exportDxf = () => {
    const g = gather();
    if (!g) return;
    downloadText(`pipeforge-${timestamp()}.dxf`, buildDxf(g.parts, g.centers), "application/dxf");
  };

  const exportPdf = () => {
    const g = gather();
    const cam = viewerRef.camera;
    if (!g || !cam) return;
    const label = VIEW_MODES.find((m) => m.v === viewMode)?.label ?? viewMode;
    downloadBlob(
      `pipeforge-${viewMode}-${timestamp()}.pdf`,
      new Blob([buildPdf(g.parts, g.centers, cam, label)], { type: "application/pdf" }),
    );
  };

  const exportIfc = () => {
    const g = gather();
    if (!g) return;
    // Straight runs (plain tube/pipe sticks) are IfcPipeSegment; unions,
    // elbows, valves etc. are IfcPipeFitting — family "tube" covers the whole
    // tube-fitting system, so it can't drive the classification.
    const kindOf = (uid: string): "segment" | "fitting" => {
      const def = getDef(placed.find((x) => x.uid === uid)?.defId ?? "");
      return def && (def.shape === "stub" || def.stretchable) ? "segment" : "fitting";
    };
    downloadText(`pipeforge-${timestamp()}.ifc`, buildIfc(g.parts, kindOf), "application/x-step");
  };

  // DWG is a closed Autodesk format with no legitimate open writer: hand the
  // user the DXF and flag the conversion step instead of pretending it's native.
  const exportDwg = () => {
    exportDxf();
    say(
      "DWG export works via format conversion: convert the downloaded DXF to DWG with the free ODA File Converter (Help → 2D drawings & exports).",
    );
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
        <span
          className="ml-2 hidden text-[10px] text-neutral-600 lg:inline"
          title={`Version ${APP_VERSION} — built ${formatBuildTime()}`}
        >
          v{APP_VERSION} · updated {formatBuildTime()}
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
      <div ref={exportRef}>
        <button
          onClick={toggleExport}
          disabled={placed.length === 0}
          className={btnCls}
          title="Export CAD formats: DXF, vector PDF, IFC (DWG via conversion)"
        >
          Export ▾
        </button>
        {exportPos && (
          <div
            className="fixed z-50 w-64 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
            style={{ left: exportPos.x, top: exportPos.y }}
          >
            {(
              [
                ["DXF — AutoCAD exchange, native", exportDxf, "3D solids + centerlines + labels"],
                ["PDF — current view, vector", exportPdf, "Wireframe of the active camera view"],
                ["IFC — BIM exchange", exportIfc, "IfcPipeSegment / IfcPipeFitting (IFC4)"],
                ["DWG — via format conversion", exportDwg, "Downloads DXF; convert with free ODA File Converter"],
              ] as const
            ).map(([label, fn, hint]) => (
              <button
                key={label}
                onClick={() => {
                  fn();
                  setExportPos(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-700"
                title={hint}
              >
                {label}
                <span className="block text-[10px] text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={importRef}>
        <button
          onClick={toggleImport}
          className={btnCls}
          title="Import: PDF part catalogs, reference drawings (DXF / PDF underlay)"
        >
          Import ▾
        </button>
        {importPos && (
          <div
            className="fixed z-50 w-64 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
            style={{ left: importPos.x, top: importPos.y }}
          >
            {(
              [
                ["catalog", "PDF catalog → parts…", "Auto-detect parts, review list before adding"],
                ["dxf", "DXF drawing → underlay…", "Lines, polylines, arcs as a locked reference layer"],
                ["pdf", "PDF drawing → underlay…", "Page 1 as an image; calibrate scale with 2 points"],
                ["dwg", "DWG drawing…", "Convert to DXF first (free ODA File Converter)"],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                onClick={() => onImportItem(id)}
                className="block w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-700"
                title={hint}
              >
                {label}
                <span className="block text-[10px] text-neutral-500">{hint}</span>
              </button>
            ))}
          </div>
        )}
        <input
          ref={catalogFileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={onCatalogFile}
        />
        <input
          ref={dxfFileRef}
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={onDxfFile}
        />
        <input
          ref={pdfDrawFileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={onPdfDrawFile}
        />
      </div>
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
        title="AI chat: describe the system in words, AI builds and fixes it (bring your own API key)"
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
      <button
        onClick={toggleTheme}
        className={btnCls}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
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
