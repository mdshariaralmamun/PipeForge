"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { useAssembly } from "@/lib/assembly";

// Renders the locked reference underlay (§6): DXF linework as line segments,
// a PDF page as a floor plane — both slightly above the grid, non-interactive.
// While calibrating, an invisible click plane collects the two scale points.
export default function ReferenceLayer() {
  const reference = useAssembly((s) => s.reference);
  const calibrating = useAssembly((s) => s.calibrating);
  const setCalibrating = useAssembly((s) => s.setCalibrating);
  const updateReference = useAssembly((s) => s.updateReference);
  const say = useAssembly((s) => s.say);
  const [calibPts, setCalibPts] = useState<[number, number][]>([]);

  // Leaving calibration mode always drops half-collected points (render-time
  // state adjustment — no effect needed).
  const [wasCalibrating, setWasCalibrating] = useState(calibrating);
  if (wasCalibrating !== calibrating) {
    setWasCalibrating(calibrating);
    if (!calibrating) setCalibPts([]);
  }

  // DXF linework → world-space line segments. Drawing +Y maps to world -Z so
  // the drawing reads upright in the Top view.
  const lineGeom = useMemo(() => {
    if (!reference?.polylines) return null;
    const s = reference.scale;
    const [ox, oz] = reference.offset;
    const pos: number[] = [];
    for (const pl of reference.polylines) {
      for (let k = 0; k + 3 < pl.length; k += 2) {
        pos.push(pl[k] * s + ox, 0.005, -pl[k + 1] * s + oz);
        pos.push(pl[k + 2] * s + ox, 0.005, -pl[k + 3] * s + oz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [reference]);
  useEffect(() => () => lineGeom?.dispose(), [lineGeom]);

  const image = reference?.image;
  const tex = useMemo(() => {
    if (!image) return null;
    const t = new THREE.TextureLoader().load(image);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [image]);
  useEffect(() => () => tex?.dispose(), [tex]);

  if (!reference || !reference.visible) return null;

  // Two-point calibration: measure the world distance between the clicks,
  // ask for the real distance, rescale around the first point (the anchor
  // keeps the underlay from jumping while rescaling).
  const onCalibClick = (e: ThreeEvent<MouseEvent>) => {
    if (!calibrating || e.delta > 4) return;
    e.stopPropagation();
    const next: [number, number][] = [...calibPts, [e.point.x, e.point.z]];
    setCalibPts(next);
    if (next.length < 2) {
      say("Calibration: first point set — click the second point.");
      return;
    }
    const [a, b] = next;
    const world = Math.hypot(b[0] - a[0], b[1] - a[1]);
    setCalibPts([]);
    setCalibrating(false);
    if (world < 1e-6) {
      say("Calibration cancelled: the two points coincide.");
      return;
    }
    const raw = window.prompt(
      `Real distance between the two points, in inches (measured ${world.toFixed(2)} in on screen)?`,
      String(Math.round(world * 10) / 10),
    );
    const real = raw ? parseFloat(raw) : NaN;
    if (!Number.isFinite(real) || real <= 0) {
      say("Calibration cancelled — underlay scale unchanged.");
      return;
    }
    const factor = real / world;
    const [ox, oz] = reference.offset;
    updateReference({
      scale: reference.scale * factor,
      offset: [a[0] + (ox - a[0]) * factor, a[1] + (oz - a[1]) * factor],
    });
    say(`Underlay calibrated: scale ×${factor.toFixed(3)} (${real} in between the points).`);
  };

  const [ox, oz] = reference.offset;
  const imgW = (reference.imgW ?? 0) * reference.scale;
  const imgH = (reference.imgH ?? 0) * reference.scale;

  return (
    <>
      {lineGeom && (
        <lineSegments geometry={lineGeom} renderOrder={1}>
          <lineBasicMaterial color="#67e8f9" transparent opacity={0.55} depthWrite={false} />
        </lineSegments>
      )}
      {tex && (
        // Pixel (px, py-down) → world (ox + px·s, oz − py·s); the plane's
        // local +Y maps to world −Z, so the page reads upright in Top view.
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[ox + imgW / 2, 0.005, oz - imgH / 2]}
          renderOrder={1}
        >
          <planeGeometry args={[imgW, imgH]} />
          <meshBasicMaterial
            map={tex}
            transparent
            opacity={0.7}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {calibPts.map((p, i) => (
        <mesh key={i} position={[p[0], 0.02, p[1]]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#f472b6" />
        </mesh>
      ))}
      {calibrating && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} onClick={onCalibClick}>
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </>
  );
}
