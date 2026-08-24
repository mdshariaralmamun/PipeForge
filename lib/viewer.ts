import type * as THREE from "three";

// Shared handle to the live WebGL renderer, scene, and active camera, set by
// the Viewport on creation. Used by the toolbar for PNG screenshots and by
// the CAD exporters (DXF/PDF/IFC) for geometry and the active projection.
export const viewerRef: {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
} = { gl: null, scene: null, camera: null };

// One-shot guard: set by a finished resize-handle drag so the Viewport can
// swallow the browser's native context menu for that right-button release.
export const contextMenuGuard = { suppress: false };

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately after the click races the browser's download manager
  // and cancels the download (observed in headless Chrome); revoke later.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
