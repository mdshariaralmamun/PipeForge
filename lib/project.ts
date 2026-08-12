import { getDef, registerCustomDef } from "./catalog";
import type { ComponentDef, PlacedComponent } from "./types";

export const STORAGE_KEY = "pipeforge.project.v1";

// v2: custom part definitions travel inside the project file, so a project
// opened on another machine (or browser) keeps its custom parts.
export interface ProjectFile {
  placed: PlacedComponent[];
  customDefs: ComponentDef[];
}

export function serializeProject(
  placed: PlacedComponent[],
  customDefs: ComponentDef[] = [],
): string {
  return JSON.stringify({ app: "pipeforge", version: 2, placed, customDefs }, null, 2);
}

function isComponentDef(raw: unknown): raw is ComponentDef {
  const d = raw as ComponentDef;
  return (
    !!d &&
    typeof d.id === "string" &&
    typeof d.partNumber === "string" &&
    Array.isArray(d.ports) &&
    typeof d.dims === "object" &&
    d.dims !== null
  );
}

// Parse a saved project. Returns null when the file is not a PipeForge
// project; silently drops placed entries whose catalog def no longer exists.
// Embedded custom defs are registered into the catalog as a side effect.
export function parseProject(text: string): ProjectFile | null {
  try {
    const data = JSON.parse(text) as { placed?: unknown; customDefs?: unknown };
    if (!data || !Array.isArray(data.placed)) return null;

    // Register embedded custom defs first, so placed entries referencing them
    // pass the getDef validation below.
    const customDefs: ComponentDef[] = [];
    if (Array.isArray(data.customDefs)) {
      for (const raw of data.customDefs) {
        if (isComponentDef(raw)) {
          customDefs.push(raw);
          registerCustomDef(raw);
        }
      }
    }

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
    return { placed: valid, customDefs };
  } catch {
    return null;
  }
}
