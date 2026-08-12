"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { getDef } from "@/lib/catalog";
import { ShapeBody, steel } from "./PartMesh";

// Live rendered preview of a catalog part — shows how the component actually
// looks (same procedural model as the 3D viewport), slowly auto-rotating.
export default function PartPreview({ defId }: { defId: string | null }) {
  const def = defId ? getDef(defId) : undefined;

  return (
    <div className="shrink-0 border-b border-neutral-800">
      <div className="h-36 w-full bg-[#101318]">
        {def ? (
          <Canvas camera={{ position: [2.4, 1.7, 2.4], fov: 40 }}>
            <color attach="background" args={["#101318"]} />
            <ambientLight intensity={0.6} />
            <hemisphereLight args={["#93a4b8", "#1a1d21", 0.4]} />
            <directionalLight position={[4, 6, 3]} intensity={1.2} />
            <group position={[0, -0.15, 0]}>
              <ShapeBody def={def} mat={steel} />
            </group>
            <OrbitControls
              autoRotate
              autoRotateSpeed={4}
              enableZoom={false}
              enablePan={false}
            />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-neutral-600">
            Hover a part to see what it looks like
          </div>
        )}
      </div>
      {def && (
        <div className="px-3 py-1.5">
          <div className="font-mono text-xs text-amber-400">{def.partNumber}</div>
          <div className="truncate text-[11px] text-neutral-400">{def.description}</div>
        </div>
      )}
    </div>
  );
}
