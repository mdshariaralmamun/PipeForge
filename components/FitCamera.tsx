"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useAssembly } from "@/lib/assembly";

// Zoom-to-fit: reframes the camera on all placed parts whenever the store's
// fitNonce increments (keyboard Z, AI build, etc.).
export default function FitCamera() {
  const fitNonce = useAssembly((s) => s.fitNonce);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    // three.js objects are mutated imperatively by design (position.copy etc.).
    /* eslint-disable react-hooks/immutability */
    if (fitNonce === 0) return;
    const placed = useAssembly.getState().placed;
    if (placed.length === 0) return;

    const center = new THREE.Vector3();
    for (const p of placed) center.add(new THREE.Vector3(...p.position));
    center.divideScalar(placed.length);
    let maxDim = 2;
    for (const p of placed)
      maxDim = Math.max(maxDim, center.distanceTo(new THREE.Vector3(...p.position)) * 2 + 1);

    const ctl = controls as { target?: THREE.Vector3; update?: () => void } | null;
    const dir = camera.position.clone().sub(ctl?.target ?? new THREE.Vector3());
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1);
    dir.normalize();
    camera.position.copy(center.clone().addScaledVector(dir, maxDim * 1.6 + 5));

    const ortho = camera as THREE.OrthographicCamera;
    if (ortho.isOrthographicCamera) {
      ortho.zoom = Math.min(80, Math.max(6, 60 / maxDim));
      ortho.updateProjectionMatrix();
    }
    if (ctl?.target) {
      ctl.target.copy(center);
      ctl.update?.();
    }
    /* eslint-enable react-hooks/immutability */
  }, [fitNonce, camera, controls]);

  return null;
}
