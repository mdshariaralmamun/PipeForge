"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useAssembly } from "@/lib/assembly";
import type { ViewMode } from "@/lib/types";
import { contextMenuGuard, viewerRef } from "@/lib/viewer";
import PartMesh from "./PartMesh";
import FitCamera from "./FitCamera";
import ReferenceLayer from "./ReferenceLayer";
import WeldMarkers from "./WeldMarkers";

// 45 deg azimuth, 35.264 deg elevation -> direction (0.577, 0.577, 0.577).
const ISO_DIR = 0.5774;
const ISO_DIST = 25;
const ISO_POS: [number, number, number] = [
  ISO_DIR * ISO_DIST,
  ISO_DIR * ISO_DIST,
  ISO_DIR * ISO_DIST,
];

// Orthographic view presets. Top view looks down -Y, so it needs a custom up vector.
const ORTHO_VIEWS: Record<
  Exclude<ViewMode, "3d">,
  { position: [number, number, number]; up: [number, number, number] }
> = {
  iso: { position: ISO_POS, up: [0, 1, 0] },
  top: { position: [0, ISO_DIST, 0], up: [0, 0, -1] },
  front: { position: [0, 0, ISO_DIST], up: [0, 1, 0] },
  side: { position: [ISO_DIST, 0, 0], up: [0, 1, 0] },
};

// Keeps viewerRef pointed at the live renderer/scene/active camera so toolbar
// actions (PNG screenshot, DXF/PDF/IFC export) work outside the r3f tree.
function ViewerBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    viewerRef.gl = gl;
    viewerRef.scene = scene;
    viewerRef.camera = camera;
  }, [gl, scene, camera]);
  return null;
}

// Dev-only hooks for the CDP mouse harness (scripts/cdp-mouse-test.mjs):
// exposes the store, the live camera, and a world→screen projector on window.
// Rendered only in development builds; never shipped to production.
function DevHooks() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__pf = useAssembly;
    w.__pfCam = camera;
    w.__pfProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return {
        x: r.left + ((v.x + 1) / 2) * r.width,
        y: r.top + ((1 - v.y) / 2) * r.height,
      };
    };
    return () => {
      delete w.__pf;
      delete w.__pfCam;
      delete w.__pfProject;
    };
  }, [camera, gl]);
  return null;
}

export default function Viewport() {
  const placed = useAssembly((s) => s.placed);
  const viewMode = useAssembly((s) => s.viewMode);
  const clearSelection = useAssembly((s) => s.clearSelection);
  const dragging = useAssembly((s) => s.dragging);
  const resizing = useAssembly((s) => s.resizing);
  const sketchMode = useAssembly((s) => s.sketchMode);
  const sketchPoints = useAssembly((s) => s.sketchPoints);
  const addSketchPoint = useAssembly((s) => s.addSketchPoint);
  const theme = useAssembly((s) => s.theme);
  const openContextMenu = useAssembly((s) => s.openContextMenu);
  const canvasMenuStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={(state) => {
        viewerRef.gl = state.gl;
      }}
      onContextMenu={(e) => {
        // A finished resize-handle drag eats the native context menu once;
        // everywhere else the app menu (or browser menu) behaves as before.
        if (contextMenuGuard.suppress) {
          e.preventDefault();
          contextMenuGuard.suppress = false;
        }
      }}
      onPointerMissed={() => {
        if (!sketchMode) clearSelection();
      }}
      onPointerDown={(e) => {
        if (e.button === 2) canvasMenuStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (e.button !== 2) return;
        const start = canvasMenuStart.current;
        canvasMenuStart.current = null;
        if (!start) return;
        if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) >= 6) {
          // Any right-drag (orbit, part, resize handle): swallow the native
          // context menu this release would fire. Clicks keep the app menu.
          contextMenuGuard.suppress = true;
          return;
        }
        // A part that just opened its own menu wins over the canvas menu.
        const cm = useAssembly.getState().contextMenu;
        if (cm && Date.now() - cm.at < 200) return;
        // Right-click on empty space: canvas command menu.
        openContextMenu(e.clientX, e.clientY, null);
      }}
    >
      <color attach="background" args={[theme === "light" ? "#dde3ea" : "#0b0e12"]} />

      {viewMode === "3d" ? (
        <PerspectiveCamera makeDefault position={[7, 5, 9]} fov={45} near={0.1} far={500} />
      ) : (
        <OrthographicCamera
          makeDefault
          position={ORTHO_VIEWS[viewMode].position}
          up={ORTHO_VIEWS[viewMode].up}
          zoom={42}
          near={-100}
          far={500}
        />
      )}
      {/* Remount on camera swap so the controls bind to the new default camera.
          §3 interaction model: left-drag on empty canvas pans (dragging a part
          moves the part instead), right-drag orbits in 3D/iso views and pans
          in the 2D views where rotation is off. */}
      <OrbitControls
        key={viewMode}
        makeDefault
        enabled={!dragging && !resizing}
        enableDamping
        dampingFactor={0.12}
        enableRotate={viewMode === "3d" || viewMode === "iso"}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: viewMode === "3d" || viewMode === "iso" ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
        }}
      />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#93a4b8", "#1a1d21", 0.35]} />
      <directionalLight position={[6, 10, 4]} intensity={1.25} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />

      <Grid
        position={[0, -0.001, 0]}
        args={[40, 40]}
        infiniteGrid
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={theme === "light" ? "#c3ccd6" : "#262b32"}
        sectionSize={2.5}
        sectionThickness={1.1}
        sectionColor={theme === "light" ? "#9aa7b5" : "#3d4650"}
        fadeDistance={50}
        fadeStrength={1.2}
      />

      {placed.map((p) => (
        <PartMesh key={p.uid} placed={p} />
      ))}

      <ReferenceLayer />

      <FitCamera />

      <WeldMarkers />

      {/* Freehand drafting: click points on the floor plane to route a run */}
      {sketchMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.75, 0]}
          onClick={(e) => {
            if (e.delta > 4) return; // ignore orbit drags
            addSketchPoint([
              Math.round(e.point.x * 4) / 4,
              0.75,
              Math.round(e.point.z * 4) / 4,
            ]);
          }}
        >
          <planeGeometry args={[80, 80]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {sketchPoints.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      ))}
      {sketchPoints.length > 1 && (
        <Line
          points={sketchPoints}
          color="#f59e0b"
          lineWidth={2}
          dashed
          dashSize={0.2}
          gapSize={0.12}
        />
      )}

      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#e4e4e7"
        />
      </GizmoHelper>

      {process.env.NODE_ENV === "development" && <DevHooks />}
      <ViewerBridge />
    </Canvas>
  );
}
