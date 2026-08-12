"use client";

import { useMemo } from "react";
import { useAssembly } from "@/lib/assembly";
import { isoSheetSvg } from "@/lib/isosheet";
import { schematicSvg } from "@/lib/schematic";
import { downloadText, timestamp } from "@/lib/viewer";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500";

// Full-screen overlay showing a generated 2D drawing (schematic or iso sheet).
export default function DrawingPanel() {
  const drawing = useAssembly((s) => s.drawing);
  const setDrawing = useAssembly((s) => s.setDrawing);
  const placed = useAssembly((s) => s.placed);

  const svg = useMemo(() => {
    if (drawing === "schematic") return schematicSvg(placed);
    if (drawing === "iso") return isoSheetSvg(placed);
    return "";
  }, [drawing, placed]);

  if (!drawing) return null;
  const name = drawing === "schematic" ? "System schematic" : "Isometric drawing sheet";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 p-6">
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <span className="text-sm font-semibold text-neutral-100">{name}</span>
        <span className="text-xs text-neutral-500">
          {placed.length} part{placed.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
        <button
          onClick={() =>
            downloadText(`pipeforge-${drawing}-${timestamp()}.svg`, svg, "image/svg+xml")
          }
          className={btnCls}
        >
          Download SVG
        </button>
        <button onClick={() => setDrawing(null)} className={btnCls}>
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-white">
        {/* SVG is generated locally from app state — safe to inject. */}
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
