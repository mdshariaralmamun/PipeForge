"use client";

import { useMemo, useState } from "react";
import { BRANDS, CATALOG, FAMILIES, SIZES, getDef } from "@/lib/catalog";
import { END_TYPE_LABEL, portsCompatible } from "@/lib/compat";
import { useAssembly } from "@/lib/assembly";
import type { Family } from "@/lib/types";
import CustomPartForm from "./CustomPartForm";
import PartPreview from "./PartPreview";

const selectCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const badgeCls = "rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400";

export default function CatalogPanel() {
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState<"all" | Family>("all");
  const [size, setSize] = useState("all");
  const [brand, setBrand] = useState("all");

  const placed = useAssembly((s) => s.placed);
  const activePort = useAssembly((s) => s.activePort);
  const compatOnly = useAssembly((s) => s.compatOnly);
  const setCompatOnly = useAssembly((s) => s.setCompatOnly);
  const clearActivePort = useAssembly((s) => s.clearActivePort);
  const placePart = useAssembly((s) => s.placePart);
  const customDefs = useAssembly((s) => s.customDefs);
  const splitTarget = useAssembly((s) => s.splitTarget);
  const setSplitTarget = useAssembly((s) => s.setSplitTarget);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const activeTarget = useMemo(() => {
    if (!activePort) return null;
    const pc = placed.find((p) => p.uid === activePort.uid);
    const def = pc ? getDef(pc.defId) : undefined;
    const port = def?.ports.find((p) => p.id === activePort.portId);
    return def && port ? { def, port } : null;
  }, [activePort, placed]);

  // Mid-run insertion: the stretchable tube being split.
  const splitDef = useMemo(() => {
    const t = splitTarget ? placed.find((p) => p.uid === splitTarget) : undefined;
    return t ? getDef(t.defId) : undefined;
  }, [splitTarget, placed]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...CATALOG, ...customDefs].filter((d) => {
      if (splitDef) {
        // Only straight-through weld fittings of the same size can split a tube.
        const size = splitDef.ports[0]?.size;
        const p1 = d.ports.find((p) => p.id === "p1");
        const p2 = d.ports.find((p) => p.id === "p2");
        if (!p1 || !p2) return false;
        const straight = p1.direction[0] === -1 && p2.direction[0] === 1;
        if (!straight || p1.endType !== "weld" || p2.endType !== "weld") return false;
        if (p1.size !== size || p2.size !== size) return false;
        if (d.id === splitDef.id) return false;
      }
      if (family !== "all" && d.family !== family) return false;
      if (brand !== "all" && d.brand !== brand) return false;
      if (size !== "all" && !d.ports.some((p) => p.size === size)) return false;
      if (q && !`${d.partNumber} ${d.description} ${d.brand}`.toLowerCase().includes(q))
        return false;
      if (
        activeTarget &&
        compatOnly &&
        !d.ports.some((p) => portsCompatible(activeTarget.port, p))
      )
        return false;
      return true;
    });
  }, [search, family, brand, size, activeTarget, compatOnly, customDefs, splitDef]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Part Catalog
        </h2>
      </div>

      {activeTarget && (
        <div className="border-b border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs">
          <div className="text-amber-300">
            Connecting to: <span className="font-mono">{activeTarget.def.partNumber}</span>
          </div>
          <div className="mt-0.5 text-amber-200/70">
            {END_TYPE_LABEL[activeTarget.port.endType]} · {activeTarget.port.size} in
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-neutral-300">
              <input
                type="checkbox"
                checked={compatOnly}
                onChange={(e) => setCompatOnly(e.target.checked)}
                className="accent-amber-500"
              />
              Compatible only
            </label>
            <button
              onClick={clearActivePort}
              className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-neutral-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {splitDef && (
        <div className="border-b border-cyan-900/50 bg-cyan-950/40 px-3 py-2 text-xs">
          <div className="text-cyan-300">
            Splitting tube: <span className="font-mono">{splitDef.partNumber}</span>
          </div>
          <div className="mt-0.5 text-cyan-200/70">
            Pick a straight-through weld fitting (tee / union) to insert mid-run
          </div>
          <button
            onClick={() => setSplitTarget(null)}
            className="mt-1.5 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300 hover:border-neutral-500"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="space-y-2 border-b border-neutral-800 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part number or description…"
          className={selectCls}
        />
        <div className="grid grid-cols-3 gap-1.5">
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as "all" | Family)}
            className={selectCls}
          >
            <option value="all">Family</option>
            {FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)} className={selectCls}>
            <option value="all">Size</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s.endsWith("mm") ? s : `${s} in`}
              </option>
            ))}
          </select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selectCls}>
            <option value="all">Brand</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PartPreview defId={previewId} />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-neutral-500">
            No parts match the current filters.
          </p>
        )}
        {list.map((d) => (
          <button
            key={d.id}
            onClick={() => placePart(d.id)}
            onMouseEnter={() => setPreviewId(d.id)}
            onFocus={() => setPreviewId(d.id)}
            className="mb-1 block w-full rounded border border-transparent px-2 py-1.5 text-left hover:border-neutral-700 hover:bg-neutral-800"
            title={`${d.description} — click to place`}
          >
            <div className="font-mono text-[13px] text-amber-400/90">{d.partNumber}</div>
            <div className="text-xs leading-tight text-neutral-300">{d.description}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className={badgeCls}>{d.brand}</span>
              <span className={badgeCls}>{d.sizeLabel}</span>
              <span className={badgeCls}>
                {d.ports.length} port{d.ports.length === 1 ? "" : "s"}
              </span>
            </div>
          </button>
        ))}
      </div>
      <CustomPartForm />
    </div>
  );
}
