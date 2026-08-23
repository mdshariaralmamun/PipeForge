// Multi-profile AI provider settings (v2). Each profile is a complete
// OpenAI-compatible config (endpoint + key + model); the active profile is
// adapted to the flat AiSettings shape the request layer (lib/ai.ts) takes,
// so request functions keep their by-value signatures. Persisted to
// localStorage; the single-config v1 blob is migrated on first read.
import { DEFAULT_AI_SETTINGS, type AiSettings } from "./ai";

export interface AiProfile {
  id: string;
  name: string;
  baseUrl: string; // OpenAI-compatible base URL (…/v1)
  apiKey: string;
  model: string;
}

export interface AiProfileStore {
  profiles: AiProfile[];
  activeId: string;
}

// Provider presets: picking one fills endpoint + model; the key is preserved.
// The model stays freeform-editable for every preset.
export const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "gpt-oss:20b" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "Moonshot AI", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k3" },
  { name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
];

const V2_KEY = "pipeforge-ai-settings-v2";
const V1_KEY = "pipeforge-ai-settings-v1"; // legacy single-config blob

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// The provider dropdown is derived from the endpoint, never stored — a
// custom URL is "Custom", a preset URL is that preset.
export function providerFor(baseUrl: string): string {
  const norm = baseUrl.trim().replace(/\/+$/, "");
  return PRESETS.find((p) => p.baseUrl === norm)?.name ?? "Custom";
}

function defaultProfile(): AiProfile {
  return { id: newId(), name: "OpenAI", ...DEFAULT_AI_SETTINGS };
}

function migrateV1(): AiProfileStore | null {
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
    const s = { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
    const provider = providerFor(s.baseUrl);
    const profile: AiProfile = {
      id: newId(),
      name: provider === "Custom" ? "My endpoint" : provider,
      ...s,
    };
    return { profiles: [profile], activeId: profile.id };
  } catch {
    return null;
  }
}

export function loadAiProfiles(): AiProfileStore {
  try {
    const raw = localStorage.getItem(V2_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AiProfileStore;
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        const activeId = parsed.profiles.some((p) => p.id === parsed.activeId)
          ? parsed.activeId
          : parsed.profiles[0].id;
        return { profiles: parsed.profiles, activeId };
      }
    }
  } catch {
    // corrupt blob — fall through to migration/default
  }
  const store = migrateV1() ?? { profiles: [defaultProfile()], activeId: "" };
  if (!store.activeId) store.activeId = store.profiles[0].id;
  saveAiProfiles(store);
  return store;
}

export function saveAiProfiles(store: AiProfileStore): void {
  try {
    localStorage.setItem(V2_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable or over quota — settings live for this session only
  }
}

// Adapter for the request layer: the active profile as a flat AiSettings.
export function activeSettings(store: AiProfileStore): AiSettings {
  const p = store.profiles.find((x) => x.id === store.activeId) ?? store.profiles[0];
  return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
}

export type TestResult = { ok: true; ms: number } | { ok: false; reason: string };

// Minimal one-token completion against the configured endpoint, used by the
// "Test connection" button to catch bad keys/endpoints before a real chat.
// The API key is never included in results, errors, or logs.
export async function testConnection(s: AiSettings): Promise<TestResult> {
  const base = s.baseUrl.trim().replace(/\/+$/, "");
  const ollama = /^https?:\/\/(localhost|127\.0\.0\.1):11434(\/|$)/.test(base);
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0] ?? base;
  const url = ollama ? `${origin}/api/chat` : `${base}/chat/completions`;
  const body = ollama
    ? { model: s.model, messages: [{ role: "user", content: "ping" }], stream: false, options: { num_predict: 1 } }
    : { model: s.model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.apiKey.trim()) headers.Authorization = `Bearer ${s.apiKey.replace(/\s+/g, "")}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        return { ok: false, reason: `bad API key (HTTP ${res.status})` };
      if (res.status === 404)
        return { ok: false, reason: "endpoint doesn't accept OpenAI chat completions (HTTP 404)" };
      return { ok: false, reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}` };
    }
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      return { ok: false, reason: "no response within 20s" };
    return { ok: false, reason: "unreachable (network/CORS — check the URL)" };
  } finally {
    clearTimeout(timer);
  }
}
