"use client";

import { useEffect, useRef, useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { SIZES } from "@/lib/catalog";
import {
  fetchMySubmissions,
  submitCatalogDefs,
  type CatalogItem,
} from "@/lib/cloudCatalog";
import { END_TYPE_LABEL } from "@/lib/compat";
import { buildCustomDef, TEMPLATES, type CustomTemplate } from "@/lib/custom";
import { isComponentDef } from "@/lib/project";
import { useSession } from "@/lib/useSession";
import type { ComponentDef, EndType } from "@/lib/types";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const labelCls = "text-[10px] uppercase tracking-wider text-neutral-500";

const END_TYPES: EndType[] = ["tube-comp", "npt-m", "npt-f", "fs-m", "fs-f", "weld", "fuse", "flange"];
const BRAND_OPTIONS = ["Generic", "Swagelok", "Uni-Lok", "Vigor", "Dockweiler", "GCE Druva"];

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-900/60 text-amber-300",
  approved: "bg-green-900/60 text-green-300",
  rejected: "bg-red-900/60 text-red-300",
};

// Form for adding user-defined catalog parts (fittings, VMB manifolds, POU hardware),
// submitting them to the shared catalog, and uploading catalog JSON files.
export default function CustomPartForm() {
  const addCustomDef = useAssembly((s) => s.addCustomDef);
  const { configured, user } = useSession();
  const [open, setOpen] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("Generic");
  const [template, setTemplate] = useState<CustomTemplate>("union");
  const [size, setSize] = useState("1/4");
  const [endType, setEndType] = useState<EndType>("tube-comp");
  const [outlets, setOutlets] = useState(4);
  const [error, setError] = useState("");
  const [mySubs, setMySubs] = useState<CatalogItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // My submission statuses (signed-in users only).
  useEffect(() => {
    if (!open || !configured || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const subs = await fetchMySubmissions();
        if (!cancelled) setMySubs(subs);
      } catch {
        /* offline — hide the list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, configured, user]);

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

  const build = () => {
    if (!partNumber.trim()) {
      setError("Part number is required.");
      return null;
    }
    try {
      return buildCustomDef({
        partNumber,
        description,
        brand,
        template,
        size,
        endType,
        outlets,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
      return null;
    }
  };

  const resetForm = () => {
    setPartNumber("");
    setDescription("");
    setError("");
    setOpen(false);
  };

  const submitLocal = () => {
    const def = build();
    if (!def) return;
    addCustomDef(def);
    resetForm();
  };

  const submitForApproval = async () => {
    const def = build();
    if (!def) return;
    addCustomDef(def);
    try {
      await submitCatalogDefs([def]);
      useAssembly.getState().say(`${def.partNumber} added locally and submitted for admin approval.`);
      const subs = await fetchMySubmissions();
      setMySubs(subs);
    } catch (e) {
      useAssembly
        .getState()
        .say(`${def.partNumber} added locally; submission failed: ${e instanceof Error ? e.message : e}`);
    }
    resetForm();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      const arr = Array.isArray(raw)
        ? raw
        : ((raw as { defs?: unknown[]; parts?: unknown[] }).defs ??
          (raw as { parts?: unknown[] }).parts ??
          []);
      const valid = (arr as unknown[]).filter(isComponentDef) as ComponentDef[];
      if (valid.length === 0) {
        setError("No valid part definitions found in that file.");
        return;
      }
      const n = await submitCatalogDefs(valid);
      useAssembly.getState().say(`${n} part(s) uploaded and submitted for admin approval.`);
      setMySubs(await fetchMySubmissions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
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
        onClick={submitLocal}
        className="w-full rounded border border-amber-700 bg-amber-950/60 px-2 py-1.5 text-xs text-amber-300 hover:border-amber-500"
      >
        Add to catalog
      </button>

      {configured &&
        (user ? (
          <>
            <button
              onClick={() => void submitForApproval()}
              className="w-full rounded border border-cyan-800 bg-cyan-950/50 px-2 py-1.5 text-xs text-cyan-300 hover:border-cyan-500"
            >
              Add &amp; submit for approval
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
            >
              Upload catalog JSON for approval
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void onUpload(e)}
            />
            {mySubs.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded border border-neutral-800">
                {mySubs.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-2 py-1 last:border-0"
                  >
                    <span className="truncate font-mono text-[11px] text-neutral-300">
                      {s.def.partNumber}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLS[s.status]}`}
                      title={s.reviewer_note ?? s.status}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-neutral-500">
            Sign in to submit parts to the shared system catalog.
          </p>
        ))}
    </div>
  );
}
