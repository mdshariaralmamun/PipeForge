"use client";

import { useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { buildCustomDef, TEMPLATES } from "@/lib/custom";
import type { CatalogDraft } from "@/lib/pdfCatalog";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";
const fieldCls =
  "rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200";

const SIZES = ["1/4", "3/8", "1/2", "6mm", "8mm", "10mm", "12mm"];

// §5 review step: parsed catalog drafts are shown for approval/editing and
// only the checked rows become catalog parts — auto-import without review
// produces garbage on any catalog with inconsistent formatting.
export default function CatalogImportDialog() {
  const { open, drafts, message, pages } = useAssembly((s) => s.catalogImport);
  const setCatalogImport = useAssembly((s) => s.setCatalogImport);
  const mergeCustomDefs = useAssembly((s) => s.mergeCustomDefs);
  const say = useAssembly((s) => s.say);
  const [rows, setRows] = useState<CatalogDraft[] | null>(null);

  if (!open) return null;

  // Local editable copy of the drafts (reset whenever a new parse opens).
  const list = rows ?? drafts;
  const close = () => {
    setRows(null);
    setCatalogImport({ open: false });
  };
  const patch = (id: string, p: Partial<CatalogDraft>) =>
    setRows(list.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const approved = list.filter((r) => r.approved);

  const commit = () => {
    const defs = approved.map((r) =>
      buildCustomDef({
        partNumber: r.partNumber,
        description: `Imported from PDF catalog (p.${r.page}) — verify against vendor data`,
        brand: r.brandGuess || "Generic",
        template: r.template,
        size: SIZES.includes(r.size) ? r.size : "1/4",
        endType: "tube-comp",
        outlets: 4,
      }),
    );
    mergeCustomDefs(defs);
    say(
      defs.length > 0
        ? `Catalog import: ${defs.length} part${defs.length === 1 ? "" : "s"} added (Custom section of the catalog).`
        : "Catalog import: nothing selected.",
    );
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-6">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">
            Import parts from PDF catalog
            {pages > 0 && (
              <span className="ml-2 text-xs font-normal text-neutral-500">
                {pages} page{pages === 1 ? "" : "s"} scanned
              </span>
            )}
          </h2>
          <button onClick={close} className={btnCls}>
            Close
          </button>
        </div>

        {message ? (
          <p className="rounded border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            {message}
          </p>
        ) : (
          <>
            <p className="text-xs text-neutral-400">
              {list.length} candidate part{list.length === 1 ? "" : "s"} found. Review the
              matches — only checked rows are added to the catalog (Custom section), where
              they can be edited or deleted later.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-neutral-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-900 text-neutral-500">
                  <tr>
                    <th className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={approved.length === list.length && list.length > 0}
                        onChange={(e) =>
                          setRows(list.map((r) => ({ ...r, approved: e.target.checked })))
                        }
                      />
                    </th>
                    <th className="px-2 py-1.5">Part number</th>
                    <th className="w-36 px-2 py-1.5">Type</th>
                    <th className="w-24 px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5">Source line</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-800/60">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={r.approved}
                          onChange={(e) => patch(r.id, { approved: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-neutral-200">{r.partNumber}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={r.template}
                          onChange={(e) =>
                            patch(r.id, {
                              template: e.target.value as CatalogDraft["template"],
                            })
                          }
                          className={fieldCls}
                        >
                          {TEMPLATES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={SIZES.includes(r.size) ? r.size : "1/4"}
                          onChange={(e) => patch(r.id, { size: e.target.value })}
                          className={fieldCls}
                        >
                          {SIZES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className="max-w-0 truncate px-2 py-1.5 text-neutral-500"
                        title={`p.${r.page} — ${r.rawLine}`}
                      >
                        p.{r.page} — {r.rawLine}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={close} className={btnCls}>
                Cancel
              </button>
              <button
                onClick={commit}
                disabled={approved.length === 0}
                className={`${btnCls} border-amber-600 bg-amber-950/60 text-amber-300`}
              >
                Add {approved.length} part{approved.length === 1 ? "" : "s"} to catalog
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
