"use client";

import { useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useAssembly } from "@/lib/assembly";
import { effPorts, getDef } from "@/lib/catalog";
import type { ComponentDef, PlacedComponent } from "@/lib/types";

// Shared materials (316 stainless look + accents).
export const steel = new THREE.MeshStandardMaterial({
  color: "#b7bcc4",
  metalness: 0.85,
  roughness: 0.35,
});
const steelSelected = new THREE.MeshStandardMaterial({
  color: "#b7bcc4",
  metalness: 0.85,
  roughness: 0.35,
  emissive: "#f59e0b",
  emissiveIntensity: 0.3,
});
const darkMetal = new THREE.MeshStandardMaterial({
  color: "#3a3f46",
  metalness: 0.6,
  roughness: 0.5,
});
const handleRed = new THREE.MeshStandardMaterial({
  color: "#b91c1c",
  metalness: 0.3,
  roughness: 0.5,
});
const dialFace = new THREE.MeshStandardMaterial({
  color: "#e8e8e6",
  metalness: 0.1,
  roughness: 0.6,
});

// Plastic piping finishes (PP-H beige, HDPE black).
const plasticMat = new THREE.MeshStandardMaterial({
  color: "#c9bd9a",
  metalness: 0.05,
  roughness: 0.75,
});
const hdpeMat = new THREE.MeshStandardMaterial({
  color: "#26262a",
  metalness: 0.1,
  roughness: 0.65,
});

// Bigger tap targets on touch devices.
const COARSE =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches ?? false);
const TAP = COARSE ? 1.7 : 1;

type Axis = "x" | "y" | "z";
const AXIS_ROT: Record<Axis, [number, number, number]> = {
  x: [0, 0, Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

interface CylProps {
  r: number;
  h: number;
  at: [number, number, number];
  axis: Axis;
  mat: THREE.Material;
  seg?: number;
}

// Cylinder primitive; default three.js cylinder axis is Y, rotated as needed.
function Cyl({ r, h, at, axis, mat, seg = 24 }: CylProps) {
  return (
    <mesh position={at} rotation={AXIS_ROT[axis]} material={mat}>
      <cylinderGeometry args={[r, r, h, seg]} />
    </mesh>
  );
}

// Procedural mesh for each catalog shape, built from the def's dims (inches).
export function ShapeBody({ def, mat }: { def: ComponentDef; mat: THREE.Material }) {
  const d = def.dims;

  switch (def.shape) {
    case "union": {
      const bodyH = Math.max(d.len - 2 * d.nutLen + 0.06, d.len * 0.3);
      return (
        <>
          <Cyl r={d.bodyDia / 2} h={bodyH} at={[0, 0, 0]} axis="x" mat={mat} />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[-(d.len / 2 - d.nutLen / 2), 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[d.len / 2 - d.nutLen / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
        </>
      );
    }

    case "elbow": {
      const R = d.leg * 0.55;
      const stub = d.leg - R;
      return (
        <>
          {/* TorusGeometry lies in the XY plane, sweeping from +X toward +Y. */}
          <mesh material={mat}>
            <torusGeometry args={[R, d.bodyDia / 2, 16, 32, Math.PI / 2]} />
          </mesh>
          <Cyl
            r={d.bodyDia / 2}
            h={stub}
            at={[(d.leg + R) / 2, 0, 0]}
            axis="x"
            mat={mat}
          />
          <Cyl
            r={d.bodyDia / 2}
            h={stub}
            at={[0, (d.leg + R) / 2, 0]}
            axis="y"
            mat={mat}
          />
          {d.nutDia > 0 && (
            <>
              <Cyl
                r={d.nutDia / 2}
                h={d.nutLen}
                at={[d.leg - d.nutLen / 2, 0, 0]}
                axis="x"
                mat={mat}
                seg={6}
              />
              <Cyl
                r={d.nutDia / 2}
                h={d.nutLen}
                at={[0, d.leg - d.nutLen / 2, 0]}
                axis="y"
                mat={mat}
                seg={6}
              />
            </>
          )}
        </>
      );
    }

    case "tee": {
      return (
        <>
          <Cyl r={d.bodyDia / 2} h={d.leg * 2} at={[0, 0, 0]} axis="x" mat={mat} />
          <Cyl r={d.bodyDia / 2} h={d.leg} at={[0, d.leg / 2, 0]} axis="y" mat={mat} />
          {d.nutDia > 0 && (
            <>
              <Cyl
                r={d.nutDia / 2}
                h={d.nutLen}
                at={[-(d.leg - d.nutLen / 2), 0, 0]}
                axis="x"
                mat={mat}
                seg={6}
              />
              <Cyl
                r={d.nutDia / 2}
                h={d.nutLen}
                at={[d.leg - d.nutLen / 2, 0, 0]}
                axis="x"
                mat={mat}
                seg={6}
              />
              <Cyl
                r={d.nutDia / 2}
                h={d.nutLen}
                at={[0, d.leg - d.nutLen / 2, 0]}
                axis="y"
                mat={mat}
                seg={6}
              />
            </>
          )}
        </>
      );
    }

    case "connector": {
      const nutL = d.nutDia > 0 ? d.nutLen : 0;
      const left = -d.len / 2 + nutL;
      const right = d.len / 2 - d.threadLen;
      return (
        <>
          {nutL > 0 && (
            <Cyl
              r={d.nutDia / 2}
              h={nutL}
              at={[-d.len / 2 + nutL / 2, 0, 0]}
              axis="x"
              mat={mat}
              seg={6}
            />
          )}
          <Cyl
            r={d.hexDia / 2}
            h={right - left}
            at={[(left + right) / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.threadDia / 2}
            h={d.threadLen}
            at={[d.len / 2 - d.threadLen / 2, 0, 0]}
            axis="x"
            mat={mat}
          />
        </>
      );
    }

    case "fconnector": {
      const nutL = d.nutDia > 0 ? d.nutLen : 0;
      const left = -d.len / 2 + nutL;
      return (
        <>
          {nutL > 0 && (
            <Cyl
              r={d.nutDia / 2}
              h={nutL}
              at={[-d.len / 2 + nutL / 2, 0, 0]}
              axis="x"
              mat={mat}
              seg={6}
            />
          )}
          <Cyl
            r={d.hexDia / 2}
            h={d.len / 2 - left}
            at={[(left + d.len / 2) / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
        </>
      );
    }

    case "nipple": {
      // Hex middle; male thread stubs only on the sides whose port is npt-m.
      const p1 = def.ports.find((p) => p.id === "p1");
      const p2 = def.ports.find((p) => p.id === "p2");
      const t1 = p1?.endType === "npt-m";
      const t2 = p2?.endType === "npt-m";
      const tl = d.threadLen;
      const left = -d.len / 2 + (t1 ? tl : 0);
      const right = d.len / 2 - (t2 ? tl : 0);
      return (
        <>
          <Cyl
            r={d.hexDia / 2}
            h={right - left}
            at={[(left + right) / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          {t1 && (
            <Cyl
              r={d.threadDia / 2}
              h={tl}
              at={[-d.len / 2 + tl / 2, 0, 0]}
              axis="x"
              mat={mat}
            />
          )}
          {t2 && (
            <Cyl
              r={d.threadDia / 2}
              h={tl}
              at={[d.len / 2 - tl / 2, 0, 0]}
              axis="x"
              mat={mat}
            />
          )}
        </>
      );
    }

    case "gland": {
      return (
        <>
          <Cyl r={d.dia / 2} h={d.len} at={[0, 0, 0]} axis="x" mat={mat} />
          <Cyl
            r={d.ringDia / 2}
            h={d.ringLen}
            at={[d.len / 2 - d.ringLen / 2 - 0.08, 0, 0]}
            axis="x"
            mat={mat}
          />
        </>
      );
    }

    case "stub": {
      return <Cyl r={d.dia / 2} h={d.len} at={[0, 0, 0]} axis="x" mat={mat} />;
    }

    case "cap": {
      return (
        <>
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[-d.len / 2 + d.nutLen / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={(d.nutDia / 2) * 0.92}
            h={d.len - d.nutLen}
            at={[d.nutLen / 2, 0, 0]}
            axis="x"
            mat={mat}
          />
        </>
      );
    }

    case "ball-valve": {
      const endH = d.portX - d.bodyW / 2;
      return (
        <>
          <mesh material={mat}>
            <boxGeometry args={[d.bodyW, d.bodyH, d.bodyD]} />
          </mesh>
          <Cyl
            r={d.tubeDia / 2}
            h={endH}
            at={[-(d.bodyW / 2 + endH / 2), 0, 0]}
            axis="x"
            mat={mat}
          />
          <Cyl
            r={d.tubeDia / 2}
            h={endH}
            at={[d.bodyW / 2 + endH / 2, 0, 0]}
            axis="x"
            mat={mat}
          />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[-(d.portX - d.nutLen / 2), 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[d.portX - d.nutLen / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.stemDia / 2}
            h={0.35}
            at={[0, d.bodyH / 2 + 0.17, 0]}
            axis="y"
            mat={mat}
          />
          <Cyl r={0.14} h={0.14} at={[0, d.bodyH / 2 + 0.38, 0]} axis="y" mat={darkMetal} />
          <mesh position={[0, d.bodyH / 2 + 0.38, 0]} material={handleRed}>
            <boxGeometry args={[0.16, 0.1, d.handleLen]} />
          </mesh>
        </>
      );
    }

    case "needle-valve": {
      const endH = d.portX - d.bodyDia / 2;
      return (
        <>
          <Cyl r={d.bodyDia / 2} h={d.bodyDia} at={[0, 0, 0]} axis="x" mat={mat} />
          <Cyl
            r={(d.bodyDia / 2) * 0.8}
            h={endH}
            at={[-(d.bodyDia / 2 + endH / 2), 0, 0]}
            axis="x"
            mat={mat}
          />
          <Cyl
            r={(d.bodyDia / 2) * 0.8}
            h={endH}
            at={[d.bodyDia / 2 + endH / 2, 0, 0]}
            axis="x"
            mat={mat}
          />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[-(d.portX - d.nutLen / 2), 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.nutDia / 2}
            h={d.nutLen}
            at={[d.portX - d.nutLen / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.bonnetDia / 2}
            h={0.5}
            at={[0, d.bodyDia / 2 + 0.25, 0]}
            axis="y"
            mat={mat}
          />
          <Cyl
            r={0.06}
            h={d.stemH}
            at={[0, d.bodyDia / 2 + d.stemH / 2, 0]}
            axis="y"
            mat={darkMetal}
          />
          <Cyl
            r={d.knobDia / 2}
            h={0.14}
            at={[0, d.bodyDia / 2 + d.stemH + 0.07, 0]}
            axis="y"
            mat={handleRed}
          />
        </>
      );
    }

    case "regulator": {
      const inner = d.bodyDia / 2 - 0.12;
      const stubH = d.portX - inner;
      return (
        <>
          <Cyl r={d.bodyDia / 2} h={d.bodyH} at={[0, 0.05, 0]} axis="y" mat={mat} />
          <Cyl
            r={d.bonnetDia / 2}
            h={d.bonnetH}
            at={[0, 0.05 + d.bodyH / 2 + d.bonnetH / 2, 0]}
            axis="y"
            mat={mat}
          />
          <Cyl
            r={d.knobDia / 2}
            h={d.knobH}
            at={[0, 0.05 + d.bodyH / 2 + d.bonnetH + d.knobH / 2, 0]}
            axis="y"
            mat={darkMetal}
          />
          <Cyl
            r={d.portDia / 2}
            h={stubH}
            at={[-(inner + stubH / 2), 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
          <Cyl
            r={d.portDia / 2}
            h={stubH}
            at={[inner + stubH / 2, 0, 0]}
            axis="x"
            mat={mat}
            seg={6}
          />
        </>
      );
    }

    case "gauge": {
      const faceY = d.stemLen + d.caseDia / 2;
      return (
        <>
          <Cyl
            r={d.stemDia / 2}
            h={d.stemLen + 0.15}
            at={[0, (d.stemLen + 0.15) / 2, 0]}
            axis="y"
            mat={mat}
          />
          <Cyl r={d.caseDia / 2} h={d.caseDepth} at={[0, faceY, 0]} axis="z" mat={mat} />
          <Cyl
            r={(d.caseDia / 2) * 0.88}
            h={0.03}
            at={[0, faceY, d.caseDepth / 2 + 0.015]}
            axis="z"
            mat={dialFace}
          />
          <mesh position={[0, faceY + d.caseDia * 0.18, d.caseDepth / 2 + 0.04]} material={darkMetal}>
            <boxGeometry args={[0.05, d.caseDia * 0.62, 0.02]} />
          </mesh>
        </>
      );
    }

    case "sleeve": {
      return (
        <>
          <Cyl r={d.dia / 2} h={d.len} at={[0, 0, 0]} axis="x" mat={mat} />
          <Cyl r={d.bandDia / 2} h={d.bandLen} at={[0, 0, 0]} axis="x" mat={mat} seg={6} />
        </>
      );
    }

    case "reducer": {
      // AXIS_ROT.x maps cylinder top (+Y) to -X, so top radius = diaA (p1) side.
      return (
        <mesh material={mat} rotation={AXIS_ROT.x}>
          <cylinderGeometry args={[d.diaA / 2, d.diaB / 2, d.len, 24]} />
        </mesh>
      );
    }

    case "pneu-valve": {
      const stubR = Math.min(d.bodyH, d.bodyD) * 0.22;
      const stubH = d.portX - d.bodyW / 2;
      return (
        <>
          <mesh material={mat}>
            <boxGeometry args={[d.bodyW, d.bodyH, d.bodyD]} />
          </mesh>
          <Cyl
            r={d.canDia / 2}
            h={d.canH}
            at={[0, d.bodyH / 2 + d.canH / 2, 0]}
            axis="y"
            mat={mat}
          />
          <Cyl
            r={d.canDia * 0.28}
            h={0.16}
            at={[0, d.bodyH / 2 + d.canH + 0.08, 0]}
            axis="y"
            mat={darkMetal}
          />
          <Cyl r={stubR} h={stubH} at={[-(d.bodyW / 2 + stubH / 2), 0, 0]} axis="x" mat={mat} />
          <Cyl r={stubR} h={stubH} at={[d.bodyW / 2 + stubH / 2, 0, 0]} axis="x" mat={mat} />
        </>
      );
    }

    case "upright": {
      // Bottom port at the local origin; stem rises +Y into a hex body.
      return (
        <>
          <Cyl r={d.stemDia / 2} h={d.stemLen} at={[0, d.stemLen / 2, 0]} axis="y" mat={mat} />
          <Cyl
            r={d.bodyDia / 2}
            h={d.bodyH}
            at={[0, d.stemLen + d.bodyH / 2, 0]}
            axis="y"
            mat={mat}
            seg={6}
          />
        </>
      );
    }

    case "block": {
      // Manifold block: box body + a cylindrical stub toward every port.
      return (
        <>
          <mesh material={mat}>
            <boxGeometry args={[d.blockW, d.blockH, d.blockD]} />
          </mesh>
          {def.ports.map((pt) => {
            const ax: "x" | "y" | "z" =
              Math.abs(pt.direction[1]) > 0.5
                ? "y"
                : Math.abs(pt.direction[2]) > 0.5
                  ? "z"
                  : "x";
            const cx = pt.position[0] - pt.direction[0] * (d.stubLen / 2);
            const cy = pt.position[1] - pt.direction[1] * (d.stubLen / 2);
            const cz = pt.position[2] - pt.direction[2] * (d.stubLen / 2);
            return (
              <Cyl
                key={pt.id}
                r={d.stubDia / 2}
                h={d.stubLen}
                at={[cx, cy, cz]}
                axis={ax}
                mat={mat}
              />
            );
          })}
        </>
      );
    }
  }
}

export default function PartMesh({ placed }: { placed: PlacedComponent }) {
  const baseDef = getDef(placed.defId);
  const selected = useAssembly((s) => s.selectedUids.includes(placed.uid));
  const activePort = useAssembly((s) => s.activePort);
  const select = useAssembly((s) => s.select);
  const toggleSelect = useAssembly((s) => s.toggleSelect);
  const setActivePort = useAssembly((s) => s.setActivePort);
  const setDragging = useAssembly((s) => s.setDragging);
  const moveSelectedTo = useAssembly((s) => s.moveSelectedTo);
  const splitTarget = useAssembly((s) => s.splitTarget);
  const setSplitTarget = useAssembly((s) => s.setSplitTarget);
  const openContextMenu = useAssembly((s) => s.openContextMenu);

  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const draggingRef = useRef(false);
  const menuStart = useRef<{ x: number; y: number } | null>(null);

  if (!baseDef) return null;

  // Stretchable parts render at their instance length, ports shifted to match.
  const def =
    baseDef.stretchable && placed.lengthOverride != null
      ? {
          ...baseDef,
          dims: { ...baseDef.dims, len: placed.lengthOverride },
          ports: effPorts(baseDef, placed.lengthOverride),
        }
      : baseDef;

  const connected = placed.connections.length > 0;
  const baseMat = def.finish === "plastic" ? plasticMat : def.finish === "hdpe" ? hdpeMat : steel;

  const onBodyClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Ctrl/Cmd+click toggles multi-selection (CAD style).
    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) toggleSelect(placed.uid);
    else select(placed.uid);
  };

  // Mouse-drag move on the horizontal plane through the part (grid-snapped).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) {
      // Right button: remember the position for the context menu; let
      // OrbitControls keep right-drag pan.
      menuStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (connected || useAssembly.getState().sketchMode) return;
    e.stopPropagation();
    select(placed.uid);
    draggingRef.current = true;
    setDragging(true);
    dragPlane.current.constant = -placed.position[1];
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(dragPlane.current, hit)) {
      moveSelectedTo(Math.round(hit.x * 4) / 4, Math.round(hit.z * 4) / 4);
    }
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) {
      const start = menuStart.current;
      menuStart.current = null;
      // Right-click (not a pan drag): open the command menu on the part.
      if (start && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 6) {
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, placed.uid);
      }
      return;
    }
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <group
      position={placed.position}
      quaternion={placed.quaternion}
      onClick={onBodyClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <ShapeBody def={def} mat={selected ? steelSelected : baseMat} />
      {def.ports.map((p) => {
        const connectedPort = placed.connections.some((c) => c.portId === p.id);
        const isActive = activePort?.uid === placed.uid && activePort?.portId === p.id;
        const markerPos: [number, number, number] = [
          p.position[0] + p.direction[0] * 0.12,
          p.position[1] + p.direction[1] * 0.12,
          p.position[2] + p.direction[2] * 0.12,
        ];
        return (
          <mesh
            key={p.id}
            position={markerPos}
            onClick={(e) => {
              e.stopPropagation();
              setActivePort(placed.uid, p.id);
            }}
          >
            <sphereGeometry args={[(isActive ? 0.1 : 0.075) * TAP, 16, 16]} />
            <meshStandardMaterial
              color={isActive ? "#facc15" : connectedPort ? "#4b5563" : "#22c55e"}
              emissive={isActive ? "#facc15" : connectedPort ? "#000000" : "#22c55e"}
              emissiveIntensity={isActive ? 0.8 : connectedPort ? 0 : 0.35}
            />
          </mesh>
        );
      })}
      {/* Mid-run split marker on free stretchable tubes (cyan cube at center). */}
      {def.stretchable && !connected && (
        <mesh
          position={[0, 0, 0]}
          onClick={(e) => {
            e.stopPropagation();
            setSplitTarget(splitTarget === placed.uid ? null : placed.uid);
          }}
        >
          <boxGeometry args={[0.16 * TAP, 0.16 * TAP, 0.16 * TAP]} />
          <meshStandardMaterial
            color={splitTarget === placed.uid ? "#facc15" : "#22d3ee"}
            emissive={splitTarget === placed.uid ? "#facc15" : "#22d3ee"}
            emissiveIntensity={0.5}
          />
        </mesh>
      )}
    </group>
  );
}
