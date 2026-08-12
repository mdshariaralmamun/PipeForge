"use client";

import { buildMto, mtoToCsv, useAssembly } from "@/lib/assembly";
import { downloadText, timestamp } from "@/lib/viewer";

export default function MtoPanel() {
  const placed = useAssembly((s) => s.placed);
  const mtoOpen = useAssembly((s) => s.mtoOpen);
  const toggleMto = useAssembly((s) => s.toggleMto);

  const lines = buildMto(placed);
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  const exportCsv = () => {
    downloadText(`pipeforge-mto-${timestamp()}.csv`, mtoToCsv(lines), "text/csv");
  };

  return (
    <section className="shrink-0 border-t border-neutral-800 bg-neutral-900">
      <header className="flex items-center gap-3 px-4 py-1.5">
        <button
          onClick={toggleMto}
          className="w-5 text-neutral-400 hover:text-neutral-200"
          title={mtoOpen ? "Collapse" : "Expand"}
        >
          {mtoOpen ? "▾" : "▸"}
        </button>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Material Take-Off
        </h2>
        <span className="text-xs text-neutral-500">
          {lines.length} line item{lines.length === 1 ? "" : "s"} · {totalQty} pcs
        </span>
        <div className="flex-1" />
        <button
          onClick={exportCsv}
          disabled={lines.length === 0}
          className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export CSV
        </button>
      </header>

      {mtoOpen && (
        <div className="max-h-56 overflow-auto border-t border-neutral-800">
          {lines.length === 0 ? (
            <p className="px-4 py-3 text-xs text-neutral-500">
              No parts placed yet — the MTO fills in as you build.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="sticky top-0 bg-neutral-900 text-[10px] uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-1.5 font-medium">Part Number</th>
                  <th className="px-3 py-1.5 font-medium">Description</th>
                  <th className="px-3 py-1.5 font-medium">Brand</th>
                  <th className="px-3 py-1.5 font-medium">Size</th>
                  <th className="px-3 py-1.5 font-medium">Material</th>
                  <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-1.5 font-medium">Order Note</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.partNumber} className="border-t border-neutral-800/60">
                    <td className="px-4 py-1.5 font-mono text-amber-400/90">{l.partNumber}</td>
                    <td className="px-3 py-1.5 text-neutral-300">{l.description}</td>
                    <td className="px-3 py-1.5 text-neutral-400">{l.brand}</td>
                    <td className="px-3 py-1.5 text-neutral-400">{l.size}</td>
                    <td className="px-3 py-1.5 text-neutral-400">{l.material}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-neutral-200">
                      {l.qty}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-400">{l.orderNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
