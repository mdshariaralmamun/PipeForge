"use client";

import { useState } from "react";
import { useAssembly } from "@/lib/assembly";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

// Commits on blur/Enter so half-typed values never move the underlay.
function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100));
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(v);
    else setText(String(Math.round(value * 100) / 100));
  };
  return (
    <label className="flex items-center gap-1 text-[11px] text-neutral-400">
      {label}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-200"
      />
    </label>
  );
}

// §6 underlay controls: scale calibration, offset, visibility, remove. The
// layer itself is locked — these are the only ways to position it.
export default function ReferencePanel() {
  const reference = useAssembly((s) => s.reference);
  const updateReference = useAssembly((s) => s.updateReference);
  const setReference = useAssembly((s) => s.setReference);
  const calibrating = useAssembly((s) => s.calibrating);
  const setCalibrating = useAssembly((s) => s.setCalibrating);

  if (!reference) return null;

  return (
    <div className="absolute bottom-3 left-3 z-20 flex w-72 flex-col gap-2 rounded border border-neutral-700 bg-neutral-900/90 p-3 text-xs shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-neutral-200" title={reference.name}>
          Underlay — {reference.name}
        </span>
        <button
          onClick={() => setReference(null)}
          className={btnCls}
          title="Remove the underlay"
        >
          ✕
        </button>
      </div>
      <div className="text-[11px] text-neutral-500">
        {reference.kind === "dxf" ? "DXF linework" : "PDF page image"} · scale{" "}
        {reference.scale.toFixed(4)} in/{reference.kind === "dxf" ? "unit" : "px"} · locked
        reference (not editable, session-only)
      </div>
      <div className="flex items-center gap-3">
        {/* key remounts the field when calibration changes the offset */}
        <NumField
          key={`x${reference.offset[0]}`}
          label="Offset X"
          value={reference.offset[0]}
          onCommit={(v) => updateReference({ offset: [v, reference.offset[1]] })}
        />
        <NumField
          key={`z${reference.offset[1]}`}
          label="Offset Z"
          value={reference.offset[1]}
          onCommit={(v) => updateReference({ offset: [reference.offset[0], v] })}
        />
        <label className="ml-auto flex items-center gap-1 text-[11px] text-neutral-400">
          <input
            type="checkbox"
            checked={reference.visible}
            onChange={(e) => updateReference({ visible: e.target.checked })}
          />
          Visible
        </label>
      </div>
      <button
        onClick={() => setCalibrating(!calibrating)}
        className={`${btnCls} ${calibrating ? "border-pink-600 bg-pink-950/50 text-pink-300" : ""}`}
        title="Click two points on the underlay, then enter the real distance to set the scale"
      >
        {calibrating ? "Cancel calibration" : "Calibrate scale (2 points)"}
      </button>
      {calibrating && (
        <p className="text-[11px] text-pink-300">
          Click two points on the underlay (Esc cancels)…
        </p>
      )}
    </div>
  );
}
