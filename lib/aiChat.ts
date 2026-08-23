// Conversational AI agent state: chat history + the send orchestrator that
// runs the model, parses its action block, and applies the actions to the
// assembly store. Persisted to localStorage so the conversation survives
// panel close / reload.
import { create } from "zustand";
import { useAssembly } from "./assembly";
import { allDefs } from "./catalog";
import {
  findDefByPart,
  parseAiActions,
  runAiChat,
  summarizeProject,
  type AiAction,
  type ChatMessage,
} from "./ai";
import { activeSettings, loadAiProfiles } from "./aiProfiles";
import type { Vec3 } from "./types";

export interface ChatMsg {
  role: "user" | "assistant" | "app"; // app = action results / errors
  text: string;
  ts: number;
}

const CHAT_STORAGE_KEY = "pipeforge-ai-chat-v1";

interface AiChatState {
  messages: ChatMsg[];
  busy: boolean;
  hydrate: () => void; // load persisted history once (client only)
  send: (text: string) => Promise<void>;
  clear: () => void;
}

function persist(messages: ChatMsg[]): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {
    // storage unavailable or over quota — chat lives for this session only
  }
}

// Apply one parsed action block to the assembly; returns a human-readable
// result line that is also shown to the model on the next turn.
function applyActions(actions: AiAction[]): string {
  const results: string[] = [];
  const skipped: string[] = [];
  let placed = 0;
  for (const a of actions) {
    if (a.op === "clear") {
      useAssembly.getState().clearAll();
      results.push("cleared all parts");
      continue;
    }
    if (a.op === "undo") {
      useAssembly.getState().undo();
      results.push("undid the last change");
      continue;
    }
    if (a.op === "remove" && a.part) {
      const def = findDefByPart(a.part);
      const st = useAssembly.getState();
      const inst = def ? [...st.placed].reverse().find((p) => p.defId === def.id) : undefined;
      if (def && inst) {
        st.deleteUids([inst.uid]);
        results.push(`removed ${def.partNumber}`);
      } else {
        skipped.push(a.part);
      }
      continue;
    }
    if (a.op === "route" && a.tube) {
      const tubeDef = findDefByPart(a.tube);
      let elbowDef = a.elbow ? findDefByPart(a.elbow) : undefined;
      if (tubeDef && !elbowDef) {
        // Elbow omitted/unknown: default to the same-size all-weld elbow,
        // preferring the tube's own brand.
        const size = tubeDef.ports[0]?.size;
        const elbows = allDefs().filter(
          (d) =>
            d.shape === "elbow" &&
            d.ports.length === 2 &&
            d.ports.every((p) => p.endType === "weld" && p.size === size),
        );
        elbowDef = elbows.find((d) => d.brand === tubeDef.brand) ?? elbows[0];
      }
      const pts = (a.points ?? []).filter(
        (p): p is Vec3 =>
          Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number" && isFinite(n)),
      );
      if (!tubeDef || !elbowDef) {
        skipped.push(`${a.tube}${a.elbow ? ` / ${a.elbow}` : ""}`);
      } else if (pts.length < 2) {
        results.push("route skipped: needs at least 2 valid [x,y,z] points");
      } else {
        const before = useAssembly.getState().placed.length;
        useAssembly.getState().placeRun(pts, tubeDef.id, elbowDef.id);
        const added = useAssembly.getState().placed.length - before;
        if (added > 0) {
          placed += added;
          results.push(`routed ${added} parts (${tubeDef.partNumber})`);
        } else {
          results.push("route placed nothing (points too close together?)");
        }
      }
      continue;
    }
    if (a.op === "add" && a.part) {
      const def = findDefByPart(a.part);
      if (!def) {
        skipped.push(a.part);
        continue;
      }
      useAssembly.getState().placePart(def.id);
      const after = useAssembly.getState();
      if (after.notice) {
        // joint refused — break the chain and continue with the next action
        skipped.push(`${a.part} (${after.notice.split(".")[0]})`);
        after.clearNotice();
        after.clearActivePort();
        continue;
      }
      if (a.length) after.setSelectedLength(a.length);
      // Keep the chain alive: the snap path auto-advances the active port,
      // the drop path does not — activate the part's main-flow outlet port:
      // the largest free end (manifold outlet > cylinder inlets), p2 on ties.
      const cur = useAssembly.getState();
      if (!cur.activePort && cur.selectedUid && def.ports.length > 0) {
        const rank = (s: string) =>
          s === "1/2" || s === "12mm" ? 3 : s === "3/8" || s === "8mm" ? 2 : 1;
        const outlet = [...def.ports].sort(
          (x, y) =>
            rank(y.size) - rank(x.size) ||
            (x.id === "p2" ? -1 : y.id === "p2" ? 1 : x.id.localeCompare(y.id)),
        )[0];
        cur.setActivePort(cur.selectedUid, outlet.id);
      }
      placed++;
      continue;
    }
    results.push(`ignored unknown action: ${JSON.stringify(a).slice(0, 80)}`);
  }
  const parts: string[] = [];
  if (placed > 0) parts.push(`placed ${placed} part${placed === 1 ? "" : "s"}`);
  parts.push(...results);
  if (skipped.length > 0) parts.push(`skipped: ${skipped.join(", ").slice(0, 220)}`);
  if (placed > 0) useAssembly.getState().zoomFit();
  return parts.length > 0 ? parts.join("; ") : "nothing to do";
}

export const useAiChat = create<AiChatState>()((set, get) => ({
  messages: [],
  busy: false,

  hydrate: () => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const msgs = JSON.parse(raw) as ChatMsg[];
      if (Array.isArray(msgs))
        set({ messages: msgs.filter((m) => m && typeof m.text === "string").slice(-100) });
    } catch {
      // storage unavailable or corrupt — start fresh
    }
  },

  send: async (text) => {
    const prompt = text.trim();
    if (!prompt || get().busy) return;
    const settings = activeSettings(loadAiProfiles());
    const local =
      settings.baseUrl.includes("localhost") || settings.baseUrl.includes("127.0.0.1");
    const push = (m: ChatMsg) => {
      const messages = [...get().messages, m];
      set({ messages });
      persist(messages);
    };
    push({ role: "user", text: prompt, ts: Date.now() });
    if (!settings.apiKey.trim() && !local) {
      push({
        role: "app",
        text: "Add an API key in Settings above — or switch to a local endpoint (Ollama: http://localhost:11434/v1, no key needed).",
        ts: Date.now(),
      });
      return;
    }
    set({ busy: true });
    try {
      const asm = useAssembly.getState();
      const summary = summarizeProject(asm.placed, asm.notice);
      // Model-facing history: app results become user-role context lines.
      const history: ChatMessage[] = get()
        .messages.map((m) =>
          m.role === "app"
            ? { role: "user" as const, content: `[app result] ${m.text}` }
            : { role: m.role, content: m.text },
        );
      const reply = await runAiChat(settings, history, summary);
      let parsed = parseAiActions(reply);
      if (parsed.error && history.length > 0) {
        // One corrective retry as a fresh conversation (a fake assistant turn
        // makes some local models confabulate): restate the request with the
        // block requirements spelled out.
        const lastUser = history[history.length - 1];
        const retryHistory = [
          ...history.slice(0, -1),
          {
            role: "user" as const,
            content: `${lastUser.content}\n\nYour previous reply's action block was unusable (${parsed.error}). Reply again: a short explanation, then ONE fenced json block whose fence contains ONLY valid JSON — {"actions":[...]} with the exact part numbers from the catalog.`,
          },
        ];
        parsed = parseAiActions(await runAiChat(settings, retryHistory, summary));
      }
      if (parsed.chat) push({ role: "assistant", text: parsed.chat, ts: Date.now() });
      if (parsed.error) push({ role: "app", text: `Action error: ${parsed.error}`, ts: Date.now() });
      if (parsed.actions.length > 0)
        push({ role: "app", text: applyActions(parsed.actions), ts: Date.now() });
      if (!parsed.chat && !parsed.error && parsed.actions.length === 0)
        push({ role: "assistant", text: "(empty reply — try again)", ts: Date.now() });
    } catch (e) {
      push({
        role: "app",
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
        ts: Date.now(),
      });
    } finally {
      set({ busy: false });
    }
  },

  clear: () => {
    set({ messages: [] });
    persist([]);
  },
}));
