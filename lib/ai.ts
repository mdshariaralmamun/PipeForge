// AI prompt-to-project (bring your own key). Talks to any OpenAI-compatible
// chat-completions endpoint — OpenAI, OpenRouter, Groq, or a local Ollama
// (http://localhost:11434/v1). The key never leaves the browser: it is stored
// only in this device's localStorage and sent only to the configured endpoint.
import { allDefs } from "./catalog";
import type { ComponentDef } from "./types";

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
      content: `You are PipeForge's AI piping designer (UHP semiconductor/lab gas and industrial liquid piping). The user describes a piping system; you reply with ONLY a JSON object:
{"steps":[{"part":"<exact part number>","length":<optional inches for stretchable tubes>}]}
Rules:
- Parts are placed in order; each new part auto-connects to the previous part's first free compatible port. Order the steps as the real flow path (source -> isolation -> pressure regulation -> manifold -> point of use).
- Use ONLY part numbers from the catalog below, exactly as written.
- Respect joining methods: weld joins weld, face-seal male joins face-seal female, NPT male joins NPT female, tube compression joins tube compression, fusion joins fusion, flange joins flange — and sizes must match. If a transition is needed, insert the adapter/reducer part between the two.
- For 1/4 in weld runs use DW-1001-1/4x0.035-1.4435-ULTRON tube with "length"; corners use DW-1101-1/4x0.035-1.4435-ULTRON elbows, branches DW-1201-1/4x0.035-1.4435-ULTRON tees.
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

export async function runAiPrompt(settings: AiSettings, prompt: string): Promise<AiStep[]> {
  const res = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: buildMessages(prompt),
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as { steps?: AiStep[] };
  if (!Array.isArray(parsed.steps)) throw new Error("AI response had no steps array");
  return parsed.steps.filter((s) => s && typeof s.part === "string").slice(0, 60);
}

// Case-insensitive part-number (or id) lookup for AI output.
export function findDefByPart(q: string): ComponentDef | undefined {
  const norm = q.trim().toLowerCase();
  return allDefs().find((d) => d.partNumber.toLowerCase() === norm || d.id === norm);
}
