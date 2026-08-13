"use client";

import { useAssembly } from "@/lib/assembly";

// AutoCAD/Revit-style right-click command menu. Right-click a part for part
// commands; right-click empty space for canvas commands.
export default function ContextMenu() {
  const menu = useAssembly((s) => s.contextMenu);
  const close = useAssembly((s) => s.closeContextMenu);

  if (!menu) return null;

  const st = useAssembly.getState;
  const item =
    "block w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-700";
  const run = (fn: () => void) => () => {
    fn();
    close();
  };
  const x = Math.min(menu.x, window.innerWidth - 200);
  const y = Math.min(menu.y, window.innerHeight - 220);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={close}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div
        className="absolute w-48 rounded border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.uid ? (
          <>
            <button
              className={item}
              onClick={run(() => {
                st().select(menu.uid);
                st().autoConnectSelected();
              })}
            >
              Auto-connect
            </button>
            <button
              className={item}
              onClick={run(() => {
                st().select(menu.uid);
                st().rotateSelected("y");
              })}
            >
              Rotate 90° about Y
            </button>
            <button className={item} onClick={run(() => st().disconnectAll(menu.uid!))}>
              Disconnect all ports
            </button>
            <button
              className={`${item} text-red-300`}
              onClick={run(() => {
                st().select(menu.uid);
                st().deleteSelected();
              })}
            >
              Delete part
            </button>
          </>
        ) : (
          <>
            <button className={item} onClick={run(() => st().zoomFit())}>
              Zoom to fit
            </button>
            <button className={item} onClick={run(() => st().toggleSketch())}>
              Sketch run
            </button>
            <button className={item} onClick={run(() => st().toggleLeftPanel())}>
              Toggle catalog panel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
