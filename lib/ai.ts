// AI prompt-to-project (bring your own key). Talks to any OpenAI-compatible
// chat-completions endpoint — OpenAI, OpenRouter, Groq, or a local Ollama
// (http://localhost:11434/v1, auto-detected and routed to Ollama's native
// /api/chat so the context size can be raised). The key never leaves the
// browser: it is stored only in this device's localStorage and sent only to
// the configured endpoint.
import { allDefs, getDef } from "./catalog";
import type { ComponentDef, PlacedComponent } from "./types";

export interface AiSettings {
  baseUrl: string; // OpenAI-compatible base URL (…/v1)
  apiKey: string;
  model: string;
}

export const AI_STORAGE_KEY = "pipeforge-ai-settings-v1";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (raw) return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    // ignore
  }
  return DEFAULT_AI_SETTINGS;
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export interface AiStep {
  part: string; // exact catalog part number
  length?: number; // optional run length for stretchable tubes, inches
}

function catalogSummary(): string {
  return allDefs()
    .map(
      (d) =>
        `${d.partNumber} — ${d.description} (ends: ${d.ports.map((p) => `${p.endType} ${p.size}`).join(" / ") || "none"})`,
    )
    .join("\n");
}

function buildMessages(prompt: string) {
  return [
    {
      role: "system" as const,
      content: `You are PipeForge's AI piping designer (UHP semiconductor/lab gas and industrial liquid piping). The user describes a piping system; you reply with ONLY a JSON object — no markdown fences, no explanation, no reasoning text:
{"steps":[{"part":"<exact part number>","length":<optional inches for stretchable tubes>}]}
Each step has exactly two fields: "part" (a single exact catalog part number) and optional "length". Never invent other fields (no "components", "description", or nested arrays) — one part per step.
Rules:
- Parts are placed in order; each new part auto-connects to the previous part's first free compatible port. Order the steps as the real flow path (source -> isolation -> pressure regulation -> manifold -> point of use).
- Use ONLY part numbers from the catalog below, exactly as written.
- "length" is in inches (1 m = 39.37 in); convert any metric distances the user gives.
- Respect joining methods: weld joins weld, face-seal male joins face-seal female, NPT male joins NPT female, tube compression joins tube compression, fusion joins fusion, flange joins flange — and sizes must match. If a transition is needed, insert the adapter/reducer part between the two.
- For 1/4 in weld runs use DW-1001-1/4x0.035-1.4435-ULTRON tube with "length"; corners use DW-1101-1/4x0.035-1.4435-ULTRON elbows, branches DW-1201-1/4x0.035-1.4435-ULTRON tees.
- For 1/2 in Dockweiler main lines use DW-2002-1/2x0.049-1.4435-TCC tube (technical gas) or DW-1002-1/2x0.049-1.4435-ULTRON tube (UHP) with "length"; corners DW-1102-1/2x0.049-1.4435-ULTRON elbows, branches DW-1202-1/2x0.049-1.4435-ULTRON tees, drop to 1/4 in with the DW-1301-1/2x1/4x0.049-1.4435-ULTRON reducer, and cross from weld to compression fittings with a transition union (SS-8-TSW-6 for 1/2 in, SS-4-TSW-6 for 1/4 in).
- At most 40 steps.
Catalog:
${catalogSummary()}`,
    },
    { role: "user" as const, content: prompt },
  ];
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}interface ChatResponse {
  choices?: { message?: { content?: string; refusal?: string } }[];
  error?: { message?: string }; // OpenRouter-style error inside a 200 response
}

async function requestContent(settings: AiSettings, messages: ChatMessage[]): Promise<string> {
  if (isOllama(settings.baseUrl)) return requestOllama(settings, messages);
  const res = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.2,
      // Generous cap: reasoning models (gpt-oss, Nemotron) burn thousands of
      // tokens on internal reasoning before emitting any content — a small
      // budget starves the answer and produced "no JSON object" errors.
      max_tokens: 16384,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as ChatResponse;
  if (data.error?.message) throw new Error(`Provider error: ${data.error.message}`);
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`AI refused: ${msg.refusal}`);
  return msg?.content ?? "";
}

// The OpenAI-compatible /v1 path cannot raise Ollama's context size, and its
// default 4096-token context is smaller than the catalog prompt alone (~4000
// tokens) — the answer space shrinks to ~150 tokens and replies come back
// empty. The native /api/chat accepts num_ctx per request, so local Ollama
// endpoints (…:11434) are routed here instead.
function isOllama(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1):11434(\/|$)/.test(baseUrl.trim());
}

async function requestOllama(settings: AiSettings, messages: ChatMessage[]): Promise<string> {
  const origin = settings.baseUrl.trim().match(/^https?:\/\/[^/]+/)?.[0] ?? "";
  // Model loads intermittently crash the llama-server on some GPUs (flaky CUDA
  // init); a crashed load is transient — the next request triggers a fresh
  // load — so retry those, up to 4 attempts total.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: false,
        think: false, // ask for a short reasoning channel; it eats the context
        // 32k: the catalog prompt is ~5k tokens and reasoning models think for
        // 10k+ — a 16k context starves the answer (done_reason "length", 0
        // content). num_predict caps the output, not the thinking.
        options: { temperature: 0.2, num_predict: 16384, num_ctx: 32768 },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { message?: { content?: string }; error?: string };
      if (data.error) throw new Error(`Ollama error: ${data.error}`);
      return data.message?.content ?? "";
    }
    const body = (await res.text()).slice(0, 300);
    const loadCrash = res.status === 500 && /terminated|CUDA error/i.test(body);
    if (!loadCrash || attempt === 3) throw new Error(`HTTP ${res.status}: ${body}`);
  }
  throw new Error("unreachable"); // the loop always returns or throws
}

function parseSteps(content: string): AiStep[] {
  const parsed = extractJson(content) as { steps?: AiStep[] };
  if (!Array.isArray(parsed.steps)) throw new Error("AI response had no steps array");
  const steps = parsed.steps.filter((s) => s && typeof s.part === "string").slice(0, 60);
  if (parsed.steps.length > 0 && steps.length === 0)
    throw new Error('AI steps used the wrong schema (need "part" fields)');
  return steps;
}

export async function runAiPrompt(settings: AiSettings, prompt: string): Promise<AiStep[]> {
  let content = await requestContent(settings, buildMessages(prompt));
  try {
    return parseSteps(content);
  } catch {
    // One corrective retry as a FRESH conversation: a fake assistant turn makes
    // some local models' chat templates invent a new user prompt instead of
    // fixing the answer. Restate the request with the schema spelled out.
    const reinforced = `${prompt}\n\nYour previous reply could not be parsed. Reply with ONLY the JSON object {"steps":[{"part":"<exact catalog part number>","length":<optional inches>}]} — one part per step, copy part numbers exactly from the catalog, no other fields, no markdown, no explanation.`;
    content = await requestContent(settings, buildMessages(reinforced));
    try {
      return parseSteps(content);
    } catch {
      const snippet = content.replace(/\s+/g, " ").trim().slice(0, 200);
      throw new Error(
        `AI returned no usable JSON${snippet ? ` — it said: "${snippet}"` : " (empty reply)"}`,
      );
    }
  }
}

// Case-insensitive part-number (or id) lookup for AI output. Local models
// often truncate long part numbers ("DW-1002" for "DW-1002-1/2x0.049-…"), so
// fall back to a prefix match when it identifies exactly one catalog part.
export function findDefByPart(q: string): ComponentDef | undefined {
  const norm = q.trim().toLowerCase();
  const exact = allDefs().find((d) => d.partNumber.toLowerCase() === norm || d.id === norm);
  if (exact || norm.length < 4) return exact;
  const matches = allDefs().filter((d) => d.partNumber.toLowerCase().startsWith(norm));
  return matches.length === 1 ? matches[0] : undefined;
}

// --- conversational agent -----------------------------------------------------

// One project mutation the chat model can request. Replies mix plain chat text
// with a single fenced ```json block holding {"actions":[...]}.
export interface AiAction {
  op: "add" | "route" | "remove" | "clear" | "undo";
  part?: string; // add/remove: exact catalog part number
  length?: number; // add: run length for stretchable tubes, inches
  tube?: string; // route: tube part number
  elbow?: string; // route: elbow part number
  points?: [number, number, number][]; // route: 3D waypoints, scene inches (Y is up)
}

// Compact text view of the current assembly, sent with every chat turn so the
// model can discuss and repair what is actually placed.
export function summarizeProject(placed: PlacedComponent[], notice: string | null): string {
  const counts = new Map<string, number>();
  const lengths = new Map<string, number>();
  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def) continue;
    counts.set(def.partNumber, (counts.get(def.partNumber) ?? 0) + 1);
    if (def.stretchable)
      lengths.set(
        def.partNumber,
        (lengths.get(def.partNumber) ?? 0) + (p.lengthOverride ?? def.dims.len),
      );
  }
  const lines = [...counts.entries()].map(
    ([pn, qty]) => `- ${pn} x${qty}${lengths.has(pn) ? ` (total run ${lengths.get(pn)!.toFixed(1)} in)` : ""}`,
  );
  let out =
    placed.length === 0
      ? "The project is empty."
      : `${placed.length} parts placed:\n${lines.join("\n")}`;
  if (notice) out += `\nLast app notice (possible problem to fix): "${notice}"`;
  return out;
}

function chatSystemPrompt(projectSummary: string): string {
  return `You are PipeForge's AI piping designer and copilot (UHP semiconductor/lab gas and industrial liquid piping). Chat with the user about their piping project: explain, answer questions, spot problems. When the user asks you to change the project, add ONE fenced json action block at the end of your reply.
Reply format:
- Normal conversation: plain text only, no JSON.
- To change the project: your explanation text, then exactly one fenced block:
\`\`\`json
{"actions":[{"op":"add","part":"<exact part number>","length":<optional inches>}]}
\`\`\`
Actions (applied in order):
- {"op":"add","part":"<exact part number>","length":<optional inches>} — place a part; it auto-connects to the previous part's first free compatible port. Order adds along the real flow path (source -> isolation -> regulation -> manifold -> point of use).
- {"op":"route","tube":"<tube part number>","elbow":"<elbow part number>","points":[[x,y,z],...]} — build a 3D tube run through waypoints (scene inches, Y is up); 90 deg corners get elbows automatically. Use for horizontal AND vertical (up/down) routing.
- {"op":"remove","part":"<exact part number>"} — delete the most recently placed instance of that part.
- {"op":"clear"} — remove ALL parts; only when the user asks to start over.
- {"op":"undo"} — undo the last change.
Rules:
- Use ONLY part numbers from the catalog below, exactly as written.
- "length" and "points" are in inches (1 m = 39.37 in); convert metric distances.
- Joining methods must match: weld joins weld, face-seal male joins face-seal female, NPT male joins NPT female, tube compression joins tube compression, fusion joins fusion, flange joins flange — sizes must match. Insert the adapter/reducer between mismatched ends (SS-8-TSW-6 bridges 1/2 in weld to 1/2 in compression, SS-4-TSW-6 for 1/4 in; DW-1301-1/2x1/4x0.049-1.4435-ULTRON reduces 1/2 in weld to 1/4 in weld).
- Gauges and male-stem instruments (PF-G25-100, GP-RV-4N) mount into a FEMALE NPT end: after tube compression parts insert SS-400-7-4 (compression x FNPT female connector), in NPT runs use GC-4N (coupling).
- Two FEMALE NPT ends (e.g. a manifold purge port to the GCE-ALM-1 alarm box) join through a GN-4N hex nipple (male x male).
- For 1/4 in weld runs use DW-1001-1/4x0.035-1.4435-ULTRON tube with DW-1101-1/4x0.035-1.4435-ULTRON elbows and DW-1201-1/4x0.035-1.4435-ULTRON tees; for 1/2 in mains use DW-2002-1/2x0.049-1.4435-TCC (technical gas) or DW-1002-1/2x0.049-1.4435-ULTRON (UHP) with DW-1102-1/2x0.049-1.4435-ULTRON elbows and DW-1202-1/2x0.049-1.4435-ULTRON tees.
- A 2-cylinder supply with auto changeover is the BMD 500-14 2X1 manifold: cylinder pigtails join its two 1/4 in FNPT inlets, its 1/2 in compression outlet feeds the main line (SS-8-TSW-6 bridges to a welded main), and its 1/4 in FNPT purge port runs to the GCE-ALM-1 alarm box. Never substitute a single-cylinder regulator (FMD 500-14) when the user asks for a manifold / changeover.
- Mounting heights: route points take any y (Y is up, inches, 1 m = 39.37 in). Floor level is y ≈ 0.75; "1.2 m above finished floor (FFL)" ≈ y 48; "ground level" ≈ y 0.75.
- At most 40 actions per reply.
Current project:
${projectSummary}
Catalog:
${catalogSummary()}`;
}

const CHAT_HISTORY_LIMIT = 12; // user+assistant messages sent per turn

export async function runAiChat(
  settings: AiSettings,
  history: ChatMessage[],
  projectSummary: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: chatSystemPrompt(projectSummary) },
    ...history.slice(-CHAT_HISTORY_LIMIT),
  ];
  const first = await requestContent(settings, messages);
  if (first.trim()) return first;
  // Reasoning models sometimes spend the whole output budget on the thinking
  // channel and return empty content — one more attempt usually lands it.
  return requestContent(settings, messages);
}

export interface ParsedAiReply {
  chat: string; // reply text with the action block removed
  actions: AiAction[]; // empty for a pure chat reply
  error?: string; // set when an action block was present but unusable
}

const AI_OPS = new Set(["add", "route", "remove", "clear", "undo"]);

function sanitizeActions(raw: unknown[]): AiAction[] {
  const out: AiAction[] = [];
  for (const a of raw.slice(0, 40)) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (typeof o.op !== "string" || !AI_OPS.has(o.op)) continue;
    out.push(o as unknown as AiAction);
  }
  return out;
}

function actionsFrom(parsed: { actions?: unknown }): AiAction[] | null {
  return Array.isArray(parsed.actions) ? sanitizeActions(parsed.actions) : null;
}

export function parseAiActions(text: string): ParsedAiReply {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (!fence) {
    // Local models often skip the fences — accept a bare JSON object too.
    const t = text.trim();
    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        const actions = actionsFrom(JSON.parse(t) as { actions?: unknown });
        if (actions) return { chat: "", actions };
      } catch {
        // not JSON after all — plain chat
      }
    }
    return { chat: text, actions: [] };
  }
  const chat = (text.slice(0, fence.index) + text.slice((fence.index ?? 0) + fence[0].length)).trim();
  try {
    const actions = actionsFrom(JSON.parse(fence[1]) as { actions?: unknown });
    if (!actions) return { chat, actions: [], error: "action block had no actions array" };
    return { chat, actions };
  } catch (e) {
    return {
      chat,
      actions: [],
      error: `action block was not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
