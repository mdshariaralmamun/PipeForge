// Shared helpers for the 2D SVG drawing exports (schematic + iso sheet).
import * as THREE from "three";
import { effPorts, getDef } from "./catalog";
import type { PlacedComponent } from "./types";

export interface NodeGeom {
  uid: string;
  partNumber: string;
  family: string;
  shape: string;
  description: string;
  origin: [number, number, number]; // world position of the part origin
  ports: { portId: string; world: [number, number, number] }[];
}

// World-space geometry of a placed component (origin + port positions).
export function nodeGeom(p: PlacedComponent): NodeGeom | null {
  const def = getDef(p.defId);
  if (!def) return null;
  const q = new THREE.Quaternion(...p.quaternion);
  const o = new THREE.Vector3(...p.position);
  return {
    uid: p.uid,
    partNumber: def.partNumber,
    family: def.family,
    shape: def.shape,
    description: def.description,
    origin: p.position,
    ports: effPorts(def, p.lengthOverride).map((pt) => {
      const w = new THREE.Vector3(...pt.position).applyQuaternion(q).add(o);
      return { portId: pt.id, world: [w.x, w.y, w.z] as [number, number, number] };
    }),
  };
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function svgDoc(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`;
}

export function svgText(
  x: number,
  y: number,
  s: string,
  size = 11,
  anchor: "start" | "middle" | "end" = "middle",
  extra = "",
): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" text-anchor="${anchor}" fill="#111"${extra ? ` ${extra}` : ""}>${esc(s)}</text>`;
}

export function svgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w = 1.5,
  dash = "",
): string {
  const dd = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#111" stroke-width="${w}"${dd}/>`;
}
