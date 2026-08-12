// Core data model for PipeForge.
// Units: inches. Axes: Y is up (three.js convention); most part port axes run along X.

export type EndType =
  | "tube-comp" // tube compression fitting stub (Swagelok-style)
  | "npt-m" // male NPT thread
  | "npt-f" // female NPT thread
  | "fs-m" // UHP face-seal male (VCR-style gland)
  | "fs-f" // UHP face-seal female (VCR-style body/nut)
  | "weld" // tube butt weld (orbital weld)
  | "fuse" // plastic heat-fusion (socket/butt fusion, PP-H / HDPE)
  | "flange"; // flanged joint (same size/rating both sides)

export type Brand =
  | "Swagelok"
  | "Uni-Lok"
  | "Vigor"
  | "Generic"
  | "Dockweiler"
  | "GCE Druva";

export type Family =
  | "tube"
  | "npt"
  | "valve"
  | "regulator"
  | "instrument"
  | "uhp"
  | "uhp-tube"
  | "plastic"
  | "support";

// Which procedural mesh builder renders this component.
export type Shape =
  | "union"
  | "elbow"
  | "tee"
  | "connector" // tube stub + hex + male thread
  | "fconnector" // tube stub + hex, female end
  | "nipple" // hex middle, male threads where ports require them
  | "gland" // plain tube + shoulder ring (VCR gland)
  | "stub" // plain tube
  | "cap" // hex + closed end, single port
  | "sleeve" // plain tube + center band (weld union)
  | "reducer" // concentric cone between two tube ODs
  | "pneu-valve" // block body + pneumatic actuator can (UHP stick valve)
  | "upright" // vertical body on a bottom port (relief valve / transducer)
  | "block" // manifold block: box + stubs toward each port
  | "ball-valve"
  | "needle-valve"
  | "regulator"
  | "gauge";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface PortDef {
  id: string; // "p1" | "p2" | "p3"
  position: Vec3; // local position of the connection face, inches
  direction: Vec3; // local unit vector, outward normal of the connection face
  endType: EndType;
  size: string; // nominal size: "1/4" | "3/8" | "1/2"
}

export interface ComponentDef {
  id: string; // slug, unique
  partNumber: string; // e.g. SS-400-6
  brand: Brand;
  family: Family;
  shape: Shape;
  description: string;
  material: string; // "316 SS"
  sizeLabel: string; // human readable primary size
  dims: Record<string, number>; // key dimensions consumed by the mesh builders
  ports: PortDef[];
  stretchable?: boolean; // tube whose length can be adjusted per placed instance
  stdLen?: number; // standard stock length (scene inches); longer runs need weld joints
  finish?: "steel" | "plastic" | "hdpe"; // render material (default steel)
}

export interface Connection {
  portId: string; // port on this component
  otherUid: string; // other placed component instance id
  otherPortId: string; // port on the other component
}

export interface PlacedComponent {
  uid: string;
  defId: string;
  position: Vec3; // world position of the component local origin
  quaternion: Quat; // world orientation
  connections: Connection[];
  lengthOverride?: number; // instance length for stretchable defs (inches)
}

export interface ActivePortRef {
  uid: string;
  portId: string;
}

// Camera view presets for the viewport.
export type ViewMode = "3d" | "iso" | "top" | "front" | "side";

export interface MtoLine {
  partNumber: string;
  description: string;
  brand: string;
  size: string;
  material: string;
  qty: number;
  totalLenIn?: number; // stretchable tubes: summed run length
  sticks?: number; // standard sticks to order
  orderNote?: string; // human ordering note (sticks x length)
}
