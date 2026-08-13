import { create } from "zustand";
import * as THREE from "three";
import { allDefs, effPorts, getDef, registerCustomDef } from "./catalog";
import { END_TYPE_LABEL, findAdapters, portsCompatible } from "./compat";
import { CUSTOM_STORAGE_KEY, serializeCustomDefs } from "./custom";
import { anyOverlap } from "./geom";
import type {
  ActivePortRef,
  ComponentDef,
  MtoLine,
  PlacedComponent,
  PortDef,
  Quat,
  Vec3,
  ViewMode,
} from "./types";

let uidCounter = 0;
function newUid(): string {
  uidCounter += 1;
  return `part-${Date.now().toString(36)}-${uidCounter}`;
}

const IDENTITY: Quat = [0, 0, 0, 1];
const HISTORY_LIMIT = 50;

// Panel docking: which screen zone each UI panel lives in.
export type PanelZone = "left" | "right" | "bottom";
export type PanelName = "catalog" | "properties" | "mto";

export interface AssemblyState {
  placed: PlacedComponent[];
  selectedUid: string | null;
  activePort: ActivePortRef | null;
  compatOnly: boolean; // when a port is active, limit catalog to compatible parts
  viewMode: ViewMode;
  mtoOpen: boolean;
  drawing: "schematic" | "iso" | null; // which 2D drawing overlay is open
  notice: string | null; // user message (e.g. refused joint + adapter suggestion)
  customDefs: ComponentDef[]; // user-added catalog parts
  dragging: boolean; // a part is being mouse-dragged (orbit controls off)
  sketchMode: boolean; // freehand run drafting: click points on the floor
  sketchPoints: Vec3[];
  splitTarget: string | null; // uid of a stretchable tube to split mid-run
  fitNonce: number; // increments to trigger a camera zoom-to-fit
  aiOpen: boolean; // AI prompt panel open
  panelLeft: boolean; // mobile drawer: catalog open
  panelRight: boolean; // mobile drawer: properties open
  past: PlacedComponent[][]; // undo stack (snapshots of `placed`)
  future: PlacedComponent[][]; // redo stack
  cloudOpen: boolean; // cloud projects dialog open
  cloudId: string | null; // currently open cloud project
  cloudName: string | null;
  systemDefs: ComponentDef[]; // approved shared-catalog parts (read-only)
  theme: "dark" | "light";
  panelZones: Record<PanelName, PanelZone>; // dock location per panel

  placePart: (defId: string) => void;
  select: (uid: string | null) => void;
  setActivePort: (uid: string, portId: string) => void;
  clearActivePort: () => void;
  clearSelection: () => void;
  setCompatOnly: (v: boolean) => void;
  nudgeSelected: (dx: number, dy: number, dz: number) => void;
  rotateSelected: (axis: "x" | "y" | "z") => void;
  rotateSelectedBy: (axis: "x" | "y" | "z", degrees: number) => void;
  setSelectedLength: (len: number) => void;
  autoConnectSelected: () => void;
  addCustomDef: (def: ComponentDef) => void;
  mergeCustomDefs: (defs: ComponentDef[]) => void;
  clearNotice: () => void;
  setDragging: (v: boolean) => void;
  moveSelectedTo: (x: number, z: number) => void;
  toggleSketch: () => void;
  addSketchPoint: (p: Vec3) => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  setSplitTarget: (uid: string | null) => void;
  insertInMiddle: (defId: string) => void;
  zoomFit: () => void;
  setAiOpen: (v: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  closePanels: () => void;
  setCloudOpen: (v: boolean) => void;
  setCloudRef: (id: string | null, name: string | null) => void;
  setSystemDefs: (defs: ComponentDef[]) => void;
  toggleTheme: () => void;
  cyclePanel: (panel: PanelName) => void;
  say: (msg: string) => void;
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  disconnect: (uid: string, portId: string) => void;
  setViewMode: (v: ViewMode) => void;
  setDrawing: (d: "schematic" | "iso" | null) => void;
  toggleMto: () => void;
  clearAll: () => void;
  loadProject: (placed: PlacedComponent[]) => void;
}

// History fields that push the current `placed` onto the undo stack.
// Call inside every structural mutation, BEFORE changing placed.
function hist(s: AssemblyState): Pick<AssemblyState, "past" | "future"> {
  return { past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.placed], future: [] };
}

export const useAssembly = create<AssemblyState>()((set, get) => ({
  placed: [],
  selectedUid: null,
  activePort: null,
  compatOnly: true,
  viewMode: "3d",
  mtoOpen: true,
  drawing: null,
  notice: null,
  customDefs: [],
  dragging: false,
  sketchMode: false,
  sketchPoints: [],
  splitTarget: null,
  fitNonce: 0,
  aiOpen: false,
  panelLeft: false,
  panelRight: false,
  past: [],
  future: [],
  cloudOpen: false,
  cloudId: null,
  cloudName: null,
  systemDefs: [],
  theme: "dark",
  panelZones: { catalog: "left", properties: "right", mto: "bottom" },

  placePart: (defId) => {
    const def = getDef(defId);
    if (!def) return;
    const s = get();

    // Mid-run insertion mode: split the target tube with this fitting.
    if (s.splitTarget) {
      get().insertInMiddle(defId);
      return;
    }

    const ap = s.activePort;
    const target = ap ? s.placed.find((p) => p.uid === ap.uid) : undefined;
    const tDef = target ? getDef(target.defId) : undefined;
    const tPort =
      tDef && ap && target
        ? effPorts(tDef, target.lengthOverride).find((p) => p.id === ap.portId)
        : undefined;
    const tBusy = target?.connections.some((c) => c.portId === ap?.portId) ?? false;

    if (target && tPort && !tBusy) {
      // First free compatible port on the incoming part.
      const cPort = def.ports.find((p) => portsCompatible(tPort, p));
      if (cPort) {
        const uid = newUid();
        const placedNew = snapOnto(target, tPort, def, cPort, uid);
        const placed = s.placed.map((p) =>
          p.uid === target.uid
            ? {
                ...p,
                connections: [
                  ...p.connections,
                  { portId: tPort.id, otherUid: uid, otherPortId: cPort.id },
                ],
              }
            : p,
        );
        // Chain building: jump the active port to the new part's next free port.
        const nextFree = def.ports.find((p) => p.id !== cPort.id);
        set({
          ...hist(s),
          placed: [...placed, placedNew],
          selectedUid: uid,
          activePort: nextFree ? { uid, portId: nextFree.id } : null,
          compatOnly: true,
          notice: null,
        });
        return;
      }
      // Real-world joint rule: refuse joints no real product can make, and
      // suggest the transition fitting that would actually be used.
      const adapters = findAdapters(tPort, def, allDefs());
      const tgt = `${tDef?.partNumber ?? "part"} ${tPort.id} (${END_TYPE_LABEL[tPort.endType]}, ${tPort.size})`;
      set({
        notice:
          adapters.length > 0
            ? `${def.partNumber} cannot join ${tgt}. Suggested adapter: ${adapters
                .map((a) => `${a.def.partNumber} (${a.note})`)
                .join(" or ")}.`
            : `${def.partNumber} cannot join ${tgt} — no compatible port, and no catalog adapter bridges this.`,
      });
      return;
    }

    // No (usable) active port: drop the part at the nearest free spot.
    const uid = newUid();
    const drop: PlacedComponent = {
      uid,
      defId,
      position: [0, 0.75, 0],
      quaternion: IDENTITY,
      connections: [],
    };
    for (const r of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10]) {
      drop.position = [r, 0.75, 0];
      if (!anyOverlap(drop, s.placed)) break;
    }
    set({
      ...hist(s),
      placed: [...s.placed, drop],
      selectedUid: uid,
      notice: null,
    });
  },

  select: (uid) => set({ selectedUid: uid }),

  setActivePort: (uid, portId) => {
    const s = get();
    const same = s.activePort?.uid === uid && s.activePort?.portId === portId;
    set(same ? { activePort: null } : { activePort: { uid, portId }, compatOnly: true });
  },

  clearActivePort: () => set({ activePort: null }),

  clearSelection: () => set({ selectedUid: null, activePort: null }),

  setCompatOnly: (v) => set({ compatOnly: v }),

  // Fine moves (nudge / mouse drag) intentionally skip history — one undo step
  // per 0.25 in move would flood the stack.
  nudgeSelected: (dx, dy, dz) => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return; // connected parts stay snapped
    set({
      placed: s.placed.map((p) =>
        p.uid === sel.uid
          ? { ...p, position: [p.position[0] + dx, p.position[1] + dy, p.position[2] + dz] }
          : p,
      ),
    });
  },

  rotateSelected: (axis) => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return;
    const q = new THREE.Quaternion(...sel.quaternion);
    const dq = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0),
      Math.PI / 2,
    );
    q.premultiply(dq);
    set({
      ...hist(s),
      placed: s.placed.map((p) =>
        p.uid === sel.uid ? { ...p, quaternion: [q.x, q.y, q.z, q.w] } : p,
      ),
    });
  },

  deleteSelected: () => {
    const sel = get().selectedUid;
    if (!sel) return;
    set((s) => ({
      ...hist(s),
      placed: s.placed
        .filter((p) => p.uid !== sel)
        .map((p) =>
          p.connections.some((c) => c.otherUid === sel)
            ? { ...p, connections: p.connections.filter((c) => c.otherUid !== sel) }
            : p,
        ),
      selectedUid: null,
      activePort: s.activePort?.uid === sel ? null : s.activePort,
    }));
  },

  disconnect: (uid, portId) => {
    set((s) => {
      const part = s.placed.find((p) => p.uid === uid);
      const conn = part?.connections.find((c) => c.portId === portId);
      if (!conn) return {};
      return {
        ...hist(s),
        placed: s.placed.map((p) => {
          if (p.uid === uid)
            return { ...p, connections: p.connections.filter((c) => c !== conn) };
          if (p.uid === conn.otherUid)
            return {
              ...p,
              connections: p.connections.filter(
                (c) => !(c.portId === conn.otherPortId && c.otherUid === uid),
              ),
            };
          return p;
        }),
        activePort:
          s.activePort && s.activePort.uid === uid && s.activePort.portId === portId
            ? null
            : s.activePort,
      };
    });
  },

  setViewMode: (v) => set({ viewMode: v }),

  setDrawing: (d) => set({ drawing: d }),

  toggleMto: () => set((s) => ({ mtoOpen: !s.mtoOpen })),

  clearAll: () =>
    set((s) => ({ ...hist(s), placed: [], selectedUid: null, activePort: null })),

  rotateSelectedBy: (axis, degrees) => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return; // connected parts stay snapped
    const q = new THREE.Quaternion(...sel.quaternion);
    const dq = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0),
      (degrees * Math.PI) / 180,
    );
    q.premultiply(dq);
    set({
      ...hist(s),
      placed: s.placed.map((p) =>
        p.uid === sel.uid ? { ...p, quaternion: [q.x, q.y, q.z, q.w] } : p,
      ),
    });
  },

  setSelectedLength: (len) => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return;
    const def = getDef(sel.defId);
    if (!def?.stretchable) return;
    const clamped = Math.min(36, Math.max(1, len));
    set({
      ...hist(s),
      placed: s.placed.map((p) =>
        p.uid === sel.uid ? { ...p, lengthOverride: clamped } : p,
      ),
      notice:
        def.stdLen && clamped > def.stdLen
          ? `Length ${clamped.toFixed(2)} in exceeds the ${def.stdLen} in standard stick — orbital weld joints are marked (orange rings, and the iso sheet weld schedule).`
          : null,
    });
  },

  autoConnectSelected: () => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return;
    const def = getDef(sel.defId);
    if (!def) return;

    // Nearest free port on another part that one of our ports can mate with.
    let best: { other: PlacedComponent; oPort: PortDef; sPort: PortDef; dist: number } | null =
      null;
    const selPos = new THREE.Vector3(...sel.position);
    for (const other of s.placed) {
      if (other.uid === sel.uid) continue;
      const oDef = getDef(other.defId);
      if (!oDef) continue;
      const oq = new THREE.Quaternion(...other.quaternion);
      const op = new THREE.Vector3(...other.position);
      for (const oPort of effPorts(oDef, other.lengthOverride)) {
        if (other.connections.some((c) => c.portId === oPort.id)) continue;
        const sPort = def.ports.find((p) => portsCompatible(oPort, p));
        if (!sPort) continue;
        const w = new THREE.Vector3(...oPort.position).applyQuaternion(oq).add(op);
        const dist = w.distanceTo(selPos);
        if (!best || dist < best.dist) best = { other, oPort, sPort, dist };
      }
    }
    if (!best) {
      set({ notice: "Auto-connect: no free compatible port found in the assembly." });
      return;
    }
    const b = best;
    const snapped = snapOnto(b.other, b.oPort, def, b.sPort, sel.uid);
    set({
      ...hist(s),
      placed: s.placed.map((p) => {
        if (p.uid === sel.uid) return snapped;
        if (p.uid === b.other.uid)
          return {
            ...p,
            connections: [
              ...p.connections,
              { portId: b.oPort.id, otherUid: sel.uid, otherPortId: b.sPort.id },
            ],
          };
        return p;
      }),
      notice: null,
    });
  },

  addCustomDef: (def) => {
    registerCustomDef(def);
    set((s) => {
      const customDefs = [...s.customDefs, def];
      try {
        localStorage.setItem(CUSTOM_STORAGE_KEY, serializeCustomDefs(customDefs));
      } catch {
        // storage unavailable — custom part lives for this session only
      }
      return { customDefs, notice: `${def.partNumber} added to the catalog.` };
    });
  },

  // Merge custom defs (e.g. from a loaded project file), deduped by id.
  mergeCustomDefs: (defs) =>
    set((s) => {
      const fresh = defs.filter((d) => !s.customDefs.some((c) => c.id === d.id));
      for (const d of fresh) registerCustomDef(d);
      if (fresh.length === 0) return {};
      const customDefs = [...s.customDefs, ...fresh];
      try {
        localStorage.setItem(CUSTOM_STORAGE_KEY, serializeCustomDefs(customDefs));
      } catch {
        // storage unavailable
      }
      return { customDefs };
    }),

  clearNotice: () => set({ notice: null }),

  // Drag start snapshots once, so a whole drag = one undo step.
  setDragging: (v) => set((s) => (v ? { ...hist(s), dragging: true } : { dragging: false })),

  moveSelectedTo: (x, z) => {
    const s = get();
    const sel = s.placed.find((p) => p.uid === s.selectedUid);
    if (!sel || sel.connections.length > 0) return;
    const cand: PlacedComponent = { ...sel, position: [x, sel.position[1], z] };
    if (anyOverlap(cand, s.placed)) return; // refuse overlapping positions
    set({ placed: s.placed.map((p) => (p.uid === sel.uid ? cand : p)) });
  },

  toggleSketch: () =>
    set((s) => ({
      sketchMode: !s.sketchMode,
      sketchPoints: [],
      splitTarget: null,
      activePort: null,
    })),

  addSketchPoint: (p) =>
    set((s) => {
      const last = s.sketchPoints[s.sketchPoints.length - 1];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.01)
        return {};
      return { sketchPoints: [...s.sketchPoints, p] };
    }),

  cancelSketch: () => set({ sketchMode: false, sketchPoints: [] }),

  finishSketch: () => {
    const s = get();
    const pts = s.sketchPoints;
    set({ sketchMode: false, sketchPoints: [] });
    if (pts.length < 2) return;
    const tubeDef = getDef("dw-1001-1-4x0-035-1-4435-ultron");
    const elbowDef = getDef("dw-1101-1-4x0-035-1-4435-ultron");
    if (!tubeDef || !elbowDef) {
      set({ notice: "Sketch needs the Dockweiler 1/4 in ULTRON tube + elbow in the catalog." });
      return;
    }
    const leg = elbowDef.dims.leg;
    const X = new THREE.Vector3(1, 0, 0);
    const n = pts.length;

    // Which interior points get an elbow (direction change ~90 deg)?
    const elbowAt = pts.map((_, i) => {
      if (i === 0 || i === n - 1) return false;
      const dIn = new THREE.Vector3(...pts[i])
        .sub(new THREE.Vector3(...pts[i - 1]))
        .normalize();
      const dOut = new THREE.Vector3(...pts[i + 1])
        .sub(new THREE.Vector3(...pts[i]))
        .normalize();
      return Math.abs(dIn.dot(dOut)) < 0.2;
    });

    const newParts: PlacedComponent[] = [];
    const link = (a: PlacedComponent, aPort: string, b: PlacedComponent, bPort: string) => {
      a.connections.push({ portId: aPort, otherUid: b.uid, otherPortId: bPort });
      b.connections.push({ portId: bPort, otherUid: a.uid, otherPortId: aPort });
    };

    let prev: PlacedComponent | null = null; // part whose free "p2" faces the next segment
    for (let i = 0; i < n - 1; i++) {
      const a = new THREE.Vector3(...pts[i]);
      const b = new THREE.Vector3(...pts[i + 1]);
      const dir = b.clone().sub(a).normalize();
      const startOff = i > 0 && elbowAt[i] ? leg : 0;
      const endOff = elbowAt[i + 1] ? leg : 0;
      const len = a.distanceTo(b) - startOff - endOff;
      if (len < 0.5) continue;
      const mid = a.clone().addScaledVector(dir, startOff + len / 2);
      const q = new THREE.Quaternion().setFromUnitVectors(X, dir);
      const tube: PlacedComponent = {
        uid: newUid(),
        defId: tubeDef.id,
        position: [mid.x, mid.y, mid.z],
        quaternion: [q.x, q.y, q.z, q.w],
        connections: [],
        lengthOverride: Math.min(36, len),
      };
      newParts.push(tube);

      if (i > 0 && prev) {
        if (elbowAt[i]) {
          // Corner: insert elbow. Local p1 = +X outward, p2 = +Y outward.
          const dIn = new THREE.Vector3(...pts[i])
            .sub(new THREE.Vector3(...pts[i - 1]))
            .normalize();
          const e1 = dIn.clone().negate();
          const e3 = new THREE.Vector3().crossVectors(e1, dir).normalize();
          const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
          const qe = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(e1, e2, e3),
          );
          const corner = new THREE.Vector3(...pts[i]);
          const elbow: PlacedComponent = {
            uid: newUid(),
            defId: elbowDef.id,
            position: [corner.x, corner.y, corner.z],
            quaternion: [qe.x, qe.y, qe.z, qe.w],
            connections: [],
          };
          newParts.push(elbow);
          link(prev, "p2", elbow, "p1");
          link(elbow, "p2", tube, "p1");
        } else {
          link(prev, "p2", tube, "p1");
        }
      }
      prev = tube;
    }

    if (newParts.length === 0) return;
    set({
      ...hist(s),
      placed: [...s.placed, ...newParts],
      selectedUid: prev?.uid ?? null,
      notice: `Run drafted: ${newParts.length} parts (1/4 in ULTRON tube, orbital-weld joints).`,
    });
  },

  setSplitTarget: (uid) => set({ splitTarget: uid, activePort: null }),

  zoomFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),

  setAiOpen: (v) => set({ aiOpen: v }),

  toggleLeftPanel: () => set((s) => ({ panelLeft: !s.panelLeft, panelRight: false })),

  toggleRightPanel: () => set((s) => ({ panelRight: !s.panelRight, panelLeft: false })),

  closePanels: () => set({ panelLeft: false, panelRight: false }),

  setCloudOpen: (v) => set({ cloudOpen: v }),

  setCloudRef: (id, name) => set({ cloudId: id, cloudName: name }),

  setSystemDefs: (defs) => set({ systemDefs: defs }),

  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("pipeforge-theme", theme);
      } catch {
        // storage unavailable
      }
      return { theme };
    }),

  cyclePanel: (panel) =>
    set((s) => {
      const order: PanelZone[] = ["left", "right", "bottom"];
      const next = order[(order.indexOf(s.panelZones[panel]) + 1) % order.length];
      const panelZones = { ...s.panelZones, [panel]: next };
      try {
        localStorage.setItem("pipeforge-panels", JSON.stringify(panelZones));
      } catch {
        // storage unavailable
      }
      return { panelZones };
    }),

  say: (msg) => set({ notice: msg }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {};
      const past = [...s.past];
      const placed = past.pop()!;
      return {
        past,
        future: [...s.future, s.placed],
        placed,
        selectedUid: null,
        activePort: null,
        splitTarget: null,
        notice: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const future = [...s.future];
      const placed = future.pop()!;
      return {
        future,
        past: [...s.past, s.placed],
        placed,
        selectedUid: null,
        activePort: null,
        splitTarget: null,
        notice: null,
      };
    }),

  insertInMiddle: (defId) => {
    const s = get();
    const target = s.placed.find((p) => p.uid === s.splitTarget);
    const tDef = target ? getDef(target.defId) : undefined;
    const newDef = getDef(defId);
    if (!target || !tDef?.stretchable || !newDef) {
      set({ splitTarget: null });
      return;
    }
    const fail = (notice: string) => set({ notice, splitTarget: null });
    if (target.connections.length > 0)
      return fail("Disconnect the tube before inserting a mid-run fitting.");
    const size = tDef.ports[0]?.size;
    const p1 = newDef.ports.find((p) => p.id === "p1");
    const p2 = newDef.ports.find((p) => p.id === "p2");
    if (!p1 || !p2) return fail(`${newDef.partNumber} has no through ports.`);
    const straight = p1.direction[0] === -1 && p2.direction[0] === 1;
    if (
      !straight ||
      p1.endType !== "weld" ||
      p2.endType !== "weld" ||
      p1.size !== size ||
      p2.size !== size
    )
      return fail(
        `${newDef.partNumber} cannot split a ${size} weld tube — it needs two straight-through ${size} weld ends.`,
      );

    const len = target.lengthOverride ?? tDef.dims.len;
    const through = Math.abs(p2.position[0] - p1.position[0]);
    const segLen = (len - through) / 2;
    if (segLen < 0.5) return fail("Tube run is too short to split with this fitting.");

    const q = new THREE.Quaternion(...target.quaternion);
    const o = new THREE.Vector3(...target.position);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    const uidMid = newUid();
    const posA = o.clone().addScaledVector(X, -(through / 2 + segLen / 2));
    const posB = o.clone().addScaledVector(X, through / 2 + segLen / 2);
    const segA: PlacedComponent = {
      uid: newUid(),
      defId: target.defId,
      position: [posA.x, posA.y, posA.z],
      quaternion: target.quaternion,
      connections: [{ portId: "p2", otherUid: uidMid, otherPortId: "p1" }],
      lengthOverride: segLen,
    };
    const segB: PlacedComponent = {
      uid: newUid(),
      defId: target.defId,
      position: [posB.x, posB.y, posB.z],
      quaternion: target.quaternion,
      connections: [{ portId: "p1", otherUid: uidMid, otherPortId: "p2" }],
      lengthOverride: segLen,
    };
    const mid: PlacedComponent = {
      uid: uidMid,
      defId,
      position: target.position,
      quaternion: target.quaternion,
      connections: [
        { portId: "p1", otherUid: segA.uid, otherPortId: "p2" },
        { portId: "p2", otherUid: segB.uid, otherPortId: "p1" },
      ],
    };
    set({
      ...hist(s),
      placed: [...s.placed.filter((p) => p.uid !== target.uid), segA, segB, mid],
      splitTarget: null,
      selectedUid: uidMid,
      notice: null,
    });
  },

  loadProject: (placed) =>
    set((s) => ({ ...hist(s), placed, selectedUid: null, activePort: null })),
}));

// Snap transform: make two port faces coincident and their axes anti-parallel
// (facing each other). Module-level so placePart and autoConnectSelected share it.
function snapOnto(
  target: PlacedComponent,
  tPort: PortDef,
  def: ComponentDef,
  cPort: PortDef,
  uid: string,
): PlacedComponent {
  const qA = new THREE.Quaternion(...target.quaternion);
  const pA = new THREE.Vector3(...target.position);
  const wPos = new THREE.Vector3(...tPort.position).applyQuaternion(qA).add(pA);
  const wDir = new THREE.Vector3(...tPort.direction).applyQuaternion(qA).normalize();
  const qB = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(...cPort.direction).normalize(),
    wDir.clone().negate(),
  );
  const pB = wPos.clone().sub(new THREE.Vector3(...cPort.position).applyQuaternion(qB));
  return {
    uid,
    defId: def.id,
    position: [pB.x, pB.y, pB.z],
    quaternion: [qB.x, qB.y, qB.z, qB.w],
    connections: [{ portId: cPort.id, otherUid: target.uid, otherPortId: tPort.id }],
  };
}

// --- MTO --------------------------------------------------------------------

export function buildMto(placed: PlacedComponent[]): MtoLine[] {
  const map = new Map<string, MtoLine>();
  const stdLenByPn = new Map<string, number>();
  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def) continue;
    const line = map.get(def.partNumber) ?? {
      partNumber: def.partNumber,
      description: def.description,
      brand: def.brand,
      size: def.sizeLabel,
      material: def.material,
      qty: 0,
    };
    line.qty += 1;
    if (def.stretchable) {
      line.totalLenIn = (line.totalLenIn ?? 0) + (p.lengthOverride ?? def.dims.len);
      if (def.stdLen) stdLenByPn.set(def.partNumber, def.stdLen);
    }
    map.set(def.partNumber, line);
  }
  // Ordering data for stretchable tube/pipe rows: standard sticks to buy.
  for (const line of map.values()) {
    const std = stdLenByPn.get(line.partNumber);
    if (std && line.totalLenIn != null) {
      line.sticks = Math.max(1, Math.ceil(line.totalLenIn / std - 1e-9));
      line.orderNote = `${line.sticks} stick(s) x ${std} in — total run ${line.totalLenIn.toFixed(1)} in`;
    }
  }
  return [...map.values()].sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function mtoToCsv(lines: MtoLine[]): string {
  const header = "Part Number,Description,Brand,Size,Material,Qty,Order Note";
  const rows = lines.map((l) =>
    [
      l.partNumber,
      l.description,
      l.brand,
      l.size,
      l.material,
      String(l.qty),
      l.orderNote ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}
