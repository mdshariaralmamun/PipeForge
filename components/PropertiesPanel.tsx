"use client";

import { useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { getDef } from "@/lib/catalog";
import { END_TYPE_LABEL } from "@/lib/compat";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";
const labelCls = "text-[10px] uppercase tracking-wider text-neutral-500";

const STEP = 0.25; // inches

export default function PropertiesPanel() {
  const placed = useAssembly((s) => s.placed);
  const selectedUid = useAssembly((s) => s.selectedUid);
  const selectedCount = useAssembly((s) => s.selectedUids.length);
  const activePort = useAssembly((s) => s.activePort);
  const setActivePort = useAssembly((s) => s.setActivePort);
  const disconnect = useAssembly((s) => s.disconnect);
  const nudgeSelected = useAssembly((s) => s.nudgeSelected);
  const rotateSelected = useAssembly((s) => s.rotateSelected);
  const rotateSelectedBy = useAssembly((s) => s.rotateSelectedBy);
  const setSelectedLength = useAssembly((s) => s.setSelectedLength);
  const autoConnectSelected = useAssembly((s) => s.autoConnectSelected);
  const deleteSelected = useAssembly((s) => s.deleteSelected);
  const cyclePanel = useAssembly((s) => s.cyclePanel);

  const [angle, setAngle] = useState(45);
  const [rotAxis, setRotAxis] = useState<"x" | "y" | "z">("y");
  const [lenInput, setLenInput] = useState("");

  const sel = placed.find((p) => p.uid === selectedUid);
  const def = sel ? getDef(sel.defId) : undefined;

  if (!sel || !def) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Properties
          </h2>
          <button
            onClick={() => cyclePanel("properties")}
            className="text-xs text-neutral-500 hover:text-amber-300"
            title="Move panel (left → right → bottom)"
          >
            ⇄ Move
          </button>
        </div>
        <div className="space-y-3 p-4 text-xs leading-relaxed text-neutral-400">
          <p className="text-neutral-300">Nothing selected.</p>
          <ol className="list-decimal space-y-2 pl-4">
            <li>Click a part in the catalog to place it in the scene.</li>
            <li>
              Click a <span className="text-green-400">green port marker</span> on a placed
              part to make it the active connection point — the catalog then lists only
              compatible parts.
            </li>
            <li>Click a compatible part to snap it onto the active port.</li>
            <li>Click a part body to select it, then move / rotate / delete it here.</li>
          </ol>
          <p className="text-neutral-500">
            Drag to orbit, right-drag to pan, scroll to zoom. The toolbar switches to an
            isometric view, exports a PNG, and saves / loads the project as JSON.
          </p>
        </div>
      </div>
    );
  }

  const connected = sel.connections.length > 0;
  const isActivePort = (portId: string) =>
    activePort?.uid === sel.uid && activePort.portId === portId;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Properties
        </h2>
        <button
          onClick={() => cyclePanel("properties")}
          className="text-xs text-neutral-500 hover:text-amber-300"
          title="Move panel (left → right → bottom)"
        >
          ⇄ Move
        </button>
      </div>

      {selectedCount > 1 && (
        <div className="border-b border-neutral-800 bg-neutral-800/40 px-3 py-1.5 text-[11px] text-neutral-400">
          {selectedCount} parts selected (Ctrl+click). Move / rotate / delete apply to all
          free selected parts.
        </div>
      )}

      <div className="border-b border-neutral-800 p-3">
        <div className="font-mono text-sm text-amber-400">{def.partNumber}</div>
        <div className="mt-0.5 text-xs text-neutral-300">{def.description}</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className={labelCls}>Brand</dt>
          <dd className="text-neutral-200">{def.brand}</dd>
          <dt className={labelCls}>Size</dt>
          <dd className="text-neutral-200">{def.sizeLabel}</dd>
          <dt className={labelCls}>Material</dt>
          <dd className="text-neutral-200">{def.material}</dd>
          <dt className={labelCls}>Instance</dt>
          <dd className="truncate font-mono text-[10px] text-neutral-500">{sel.uid}</dd>
        </dl>
      </div>

      <div className="border-b border-neutral-800 p-3">
        <h3 className={labelCls}>Transform</h3>
        {connected && (
          <p className="mt-1 text-[11px] text-neutral-500">
            Part has connections — disconnect its ports before moving or rotating.
          </p>
        )}
        <div className="mt-2 space-y-1.5">
          {(["X", "Y", "Z"] as const).map((axis, i) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="w-4 text-xs text-neutral-400">{axis}</span>
              <button
                disabled={connected}
                onClick={() =>
                  nudgeSelected(
                    i === 0 ? -STEP : 0,
                    i === 1 ? -STEP : 0,
                    i === 2 ? -STEP : 0,
                  )
                }
                className={btnCls}
              >
                − {STEP}
              </button>
              <button
                disabled={connected}
                onClick={() =>
                  nudgeSelected(i === 0 ? STEP : 0, i === 1 ? STEP : 0, i === 2 ? STEP : 0)
                }
                className={btnCls}
              >
                + {STEP}
              </button>
              <button
                disabled={connected}
                onClick={() => rotateSelected(axis.toLowerCase() as "x" | "y" | "z")}
                className={btnCls}
              >
                Rot 90°
              </button>
            </div>
          ))}
        </div>

        {/* Free rotation: any axis, any angle 0-360 (AutoCAD/Revit style) */}
        <div className="mt-2 flex items-center gap-2 border-t border-neutral-800 pt-2">
          <span className="text-xs text-neutral-400">Rotate</span>
          <select
            value={rotAxis}
            onChange={(e) => setRotAxis(e.target.value as "x" | "y" | "z")}
            className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs text-neutral-200"
          >
            <option value="x">X</option>
            <option value="y">Y</option>
            <option value="z">Z</option>
          </select>
          <input
            type="number"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            step={5}
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs text-neutral-200"
          />
          <span className="text-xs text-neutral-500">deg</span>
          <button
            disabled={connected}
            onClick={() => rotateSelectedBy(rotAxis, angle)}
            className={btnCls}
            title="Rotate by any angle, 0-360 deg"
          >
            Apply
          </button>
        </div>

        <button
          disabled={connected}
          onClick={autoConnectSelected}
          className={`${btnCls} mt-2 w-full`}
          title="Snap this part onto the nearest free compatible port in the assembly"
        >
          Auto-connect to nearest port
        </button>

        {/* Stretchable tube length (standard stick + weld joints) */}
        {def.stretchable && (
          <div className="mt-2 space-y-1.5 border-t border-neutral-800 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Length</span>
              <input
                type="number"
                value={lenInput || String(sel.lengthOverride ?? def.dims.len)}
                onChange={(e) => setLenInput(e.target.value)}
                step={0.5}
                min={1}
                max={36}
                className="w-20 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs text-neutral-200"
              />
              <span className="text-xs text-neutral-500">in</span>
              <button
                disabled={connected}
                onClick={() => {
                  const v = parseFloat(lenInput);
                  if (!Number.isNaN(v)) setSelectedLength(v);
                  setLenInput("");
                }}
                className={btnCls}
              >
                Set
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Standard stick: {def.stdLen} in. Longer runs get orbital weld joints
              automatically (orange rings + weld schedule on the iso sheet).
            </p>
          </div>
        )}
      </div>

      {def.shape === "elbow" && (
        <div className="border-b border-neutral-800 p-3">
          <h3 className={labelCls}>Bend data (90 deg)</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className={labelCls}>Centerline R</dt>
            <dd className="text-neutral-200">{(def.dims.leg ?? 0.75).toFixed(2)} in</dd>
            <dt className={labelCls}>Arc (allowance)</dt>
            <dd className="text-neutral-200">
              {(((def.dims.leg ?? 0.75) * Math.PI) / 2).toFixed(2)} in
            </dd>
            <dt className={labelCls}>Setback</dt>
            <dd className="text-neutral-200">{(def.dims.leg ?? 0.75).toFixed(2)} in</dd>
            <dt className={labelCls}>Gain</dt>
            <dd className="text-neutral-200">
              {((def.dims.leg ?? 0.75) * (2 - Math.PI / 2)).toFixed(2)} in
            </dd>
          </dl>
          <p className="mt-1 text-[11px] text-neutral-500">
            Tagged in the iso sheet bend schedule.
          </p>
        </div>
      )}

      <div className="border-b border-neutral-800 p-3">
        <h3 className={labelCls}>Ports</h3>
        <div className="mt-2 space-y-1.5">
          {def.ports.map((p) => {
            const conn = sel.connections.find((c) => c.portId === p.id);
            const other = conn ? placed.find((x) => x.uid === conn.otherUid) : undefined;
            const otherDef = other ? getDef(other.defId) : undefined;
            const isActive = isActivePort(p.id);
            return (
              <div
                key={p.id}
                className={`rounded border px-2 py-1.5 text-xs ${
                  isActive
                    ? "border-amber-600 bg-amber-950/40"
                    : "border-neutral-800 bg-neutral-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-neutral-300">{p.id}</span>
                  <span className="text-neutral-400">
                    {END_TYPE_LABEL[p.endType]} · {p.size} in
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {conn ? (
                    <>
                      <span className="truncate text-neutral-500">
                        → <span className="font-mono">{otherDef?.partNumber ?? "?"}</span>
                      </span>
                      <button onClick={() => disconnect(sel.uid, p.id)} className={btnCls}>
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={isActive ? "text-amber-300" : "text-green-500"}>
                        {isActive ? "Active connection point" : "Free"}
                      </span>
                      <button onClick={() => setActivePort(sel.uid, p.id)} className={btnCls}>
                        {isActive ? "Clear" : "Set active"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={deleteSelected}
          className="w-full rounded border border-red-900 bg-red-950/60 px-2 py-1.5 text-xs text-red-300 hover:border-red-600"
        >
          Delete part
        </button>
      </div>
    </div>
  );
}
