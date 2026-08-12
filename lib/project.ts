import { getDef } from "./catalog";
import type { PlacedComponent } from "./types";

export const STORAGE_KEY = "pipeforge.project.v1";

export function serializeProject(placed: PlacedComponent[]): string {
  return JSON.stringify({ app: "pipeforge", version: 1, placed }, null, 2);
}

// Parse a saved project. Returns null when the file is not a PipeForge
// project; silently drops entries whose catalog def no longer exists.
export function parseProject(text: string): PlacedComponent[] | null {
  try {
    const data = JSON.parse(text) as { placed?: unknown };
    if (!data || !Array.isArray(data.placed)) return null;
    const valid: PlacedComponent[] = [];
    for (const raw of data.placed as PlacedComponent[]) {
      if (
        raw &&
        typeof raw.uid === "string" &&
        typeof raw.defId === "string" &&
        getDef(raw.defId) &&
        Array.isArray(raw.position) &&
        Array.isArray(raw.quaternion)
      ) {
        valid.push({
          uid: raw.uid,
          defId: raw.defId,
          position: raw.position,
          quaternion: raw.quaternion,
          connections: Array.isArray(raw.connections) ? raw.connections : [],
          lengthOverride:
            typeof raw.lengthOverride === "number" ? raw.lengthOverride : undefined,
        });
      }
    }
    return valid;
  } catch {
    return null;
  }
}
