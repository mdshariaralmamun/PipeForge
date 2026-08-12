"use client";

import { useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { SIZES } from "@/lib/catalog";
import { END_TYPE_LABEL } from "@/lib/compat";
import { buildCustomDef, TEMPLATES, type CustomTemplate } from "@/lib/custom";
import type { EndType } from "@/lib/types";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const labelCls = "text-[10px] uppercase tracking-wider text-neutral-500";

const END_TYPES: EndType[] = ["tube-comp", "npt-m", "npt-f", "fs-m", "fs-f", "weld"];
const BRAND_OPTIONS = ["Generic", "Swagelok", "Uni-Lok", "Vigor", "Dockweiler", "GCE Druva"];

// Form for adding user-defined catalog parts (fittings, VMB manifolds, POU hardware).
export default function CustomPartForm() {
  const addCustomDef = useAssembly((s) => s.addCustomDef);
  const [open, setOpen] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("Generic");
  const [template, setTemplate] = useState<CustomTemplate>("union");
  const [size, setSize] = useState("1/4");
  const [endType, setEndType] = useState<EndType>("tube-comp");
  const [outlets, setOutlets] = useState(4);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="m-2 shrink-0 rounded border border-dashed border-neutral-600 px-2 py-1.5 text-xs text-neutral-300 hover:border-amber-500 hover:text-amber-300"
      >
        + Add custom part / manifold
      </button>
    );
  }

  const submit = () => {
    if (!partNumber.trim()) {
      setError("Part number is required.");
      return;
    }
    try {
      addCustomDef(
        buildCustomDef({ partNumber, description, brand, template, size, endType, outlets }),
      );
      setPartNumber("");
      setDescription("");
      setError("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
    }
  };

  return (
    <div className="shrink-0 space-y-2 border-t border-neutral-800 p-3">
      <div className="flex items-center justify-between">
        <h3 className={labelCls}>Custom part</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          Close
        </button>
      </div>
      <input
        value={partNumber}
        onChange={(e) => setPartNumber(e.target.value)}
        placeholder="Part number *"
        className={fieldCls}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className={fieldCls}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value as CustomTemplate)}
          className={fieldCls}
        >
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldCls}>
          {BRAND_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={size} onChange={(e) => setSize(e.target.value)} className={fieldCls}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={endType}
          onChange={(e) => setEndType(e.target.value as EndType)}
          className={fieldCls}
        >
          {END_TYPES.map((t) => (
            <option key={t} value={t}>
              {END_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      {template === "manifold" && (
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          Outlets
          <input
            type="number"
            min={2}
            max={8}
            value={outlets}
            onChange={(e) => setOutlets(Number(e.target.value))}
            className={fieldCls}
          />
        </label>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        className="w-full rounded border border-amber-700 bg-amber-950/60 px-2 py-1.5 text-xs text-amber-300 hover:border-amber-500"
      >
        Add to catalog
      </button>
    </div>
  );
}
