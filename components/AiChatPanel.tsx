"use client";

import { useEffect, useRef, useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { useAiChat } from "@/lib/aiChat";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai";
import {
  PRESETS,
  activeSettings,
  loadAiProfiles,
  providerFor,
  saveAiProfiles,
  testConnection,
  type AiProfileStore,
  type TestResult,
} from "@/lib/aiProfiles";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

interface ListedModel {
  id: string; // valid model ID, e.g. google/gemma-3-27b-it
  name: string; // display name, e.g. "Gemma 3 27B Instruct"
}

// AI chat palette: continuous conversation that can also modify the project
// (BYOK — the key stays in this browser only).
export default function AiChatPanel() {
  const cyclePanel = useAssembly((s) => s.cyclePanel);
  const setAiOpen = useAssembly((s) => s.setAiOpen);
  const messages = useAiChat((s) => s.messages);
  const busy = useAiChat((s) => s.busy);
  const send = useAiChat((s) => s.send);
  const clear = useAiChat((s) => s.clear);
  const hydrate = useAiChat((s) => s.hydrate);

  const [store, setStore] = useState<AiProfileStore>(() => loadAiProfiles());
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Model list picker state (works with any endpoint that answers GET /models)
  const [models, setModels] = useState<ListedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const [test, setTest] = useState<"idle" | "running" | TestResult>("idle");

  // Panel-local palette (dark/light), independent of the global app theme.
  // Hydrated from localStorage after mount to avoid an SSR/client mismatch.
  const [palette, setPalette] = useState<"dark" | "light">("dark");
  useEffect(() => {
    try {
      if (localStorage.getItem("pipeforge-ai-palette") === "light") setPalette("light");
    } catch {
      // storage unavailable — default dark
    }
  }, []);
  const togglePalette = () =>
    setPalette((p) => {
      const next = p === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("pipeforge-ai-palette", next);
      } catch {
        // storage unavailable — palette lives for this session only
      }
      return next;
    });

  const profile =
    store.profiles.find((p) => p.id === store.activeId) ?? store.profiles[0];

  useEffect(() => hydrate(), [hydrate]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Fetch the model list from the active endpoint (OpenAI shape: GET
  // {base}/models → {data:[{id,…}]}). OpenRouter answers without a key;
  // most others need the Bearer header. Failure just leaves the list empty —
  // the model field stays freeform.
  const loadModels = async () => {
    const base = profile.baseUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) return;
    setModelsLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (profile.apiKey.trim())
        headers.Authorization = `Bearer ${profile.apiKey.replace(/\s+/g, "")}`;
      const res = await fetch(`${base}/models`, { headers });
      const data = (await res.json()) as { data?: { id: string; name?: string }[] };
      const list = (data.data ?? [])
        .filter((m) => typeof m.id === "string")
        .map((m) => ({ id: m.id, name: m.name || m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
      setModels(list);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  // Load models on mount and when the endpoint changes (debounced — the
  // endpoint field saves on every keystroke).
  useEffect(() => {
    const t = setTimeout(() => void loadModels(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.baseUrl, profile.id]);

  // Auto-correct a saved display name (e.g. "Gemma 4 26B A4B") to the real
  // model ID (e.g. "google/gemma-3-27b-it") once the model list arrives.
  useEffect(() => {
    if (models.length === 0) return;
    const saved = profile.model.trim();
    if (!saved) return;
    if (models.some((m) => m.id === saved)) return; // already a valid ID
    const byName = models.find((m) => m.name.toLowerCase() === saved.toLowerCase());
    if (byName) set({ model: byName.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  // Close the picker when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Patch the active profile and persist immediately (save-on-keystroke).
  const set = (patch: Partial<Omit<(typeof store.profiles)[number], "id">>) =>
    setStore((s) => {
      const next: AiProfileStore = {
        ...s,
        profiles: s.profiles.map((p) => (p.id === s.activeId ? { ...p, ...patch } : p)),
      };
      saveAiProfiles(next);
      return next;
    });

  const selectProfile = (id: string) =>
    setStore((s) => {
      const next = { ...s, activeId: id };
      saveAiProfiles(next);
      return next;
    });

  const addProfile = () =>
    setStore((s) => {
      const p = {
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        name: `Profile ${s.profiles.length + 1}`,
        ...DEFAULT_AI_SETTINGS,
      };
      const next = { profiles: [...s.profiles, p], activeId: p.id };
      saveAiProfiles(next);
      return next;
    });

  const renameProfile = () => {
    const name = window.prompt("Profile name", profile.name)?.trim();
    if (name) set({ name });
  };

  const deleteProfile = () => {
    if (store.profiles.length <= 1) return;
    if (!window.confirm(`Delete profile "${profile.name}"?`)) return;
    setStore((s) => {
      const profiles = s.profiles.filter((p) => p.id !== s.activeId);
      const next = { profiles, activeId: profiles[0].id };
      saveAiProfiles(next);
      return next;
    });
  };

  const runTest = async () => {
    setTest("running");
    setTest(await testConnection(activeSettings(store)));
  };

  const presetName = providerFor(profile.baseUrl);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  };

  const filtered = modelFilter.trim()
    ? models.filter((m) =>
        `${m.id} ${m.name}`.toLowerCase().includes(modelFilter.trim().toLowerCase()),
      )
    : models;

  return (
    <div className="ai-panel flex min-h-0 flex-1 flex-col" data-ai-theme={palette}>
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          AI chat
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePalette}
            className="text-xs text-neutral-500 hover:text-amber-300"
            title={`AI panel palette: ${palette === "dark" ? "switch to light" : "switch to dark"}`}
          >
            {palette === "dark" ? "☀" : "☾"}
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`text-xs ${showSettings ? "text-amber-300" : "text-neutral-500"} hover:text-amber-300`}
            title="Profiles, provider, API key and model"
          >
            ⚙ Settings
          </button>
          <button
            onClick={() => cyclePanel("ai")}
            className="text-xs text-neutral-500 hover:text-amber-300"
            title="Move panel (left → right → bottom)"
          >
            ⇄ Move
          </button>
          <button
            onClick={() => setAiOpen(false)}
            className="text-xs text-neutral-500 hover:text-amber-300"
            title="Close the AI chat (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 p-3">
          <div className="col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Profile
            </span>
            <div className="flex gap-1">
              <select
                value={store.activeId}
                onChange={(e) => selectProfile(e.target.value)}
                className={fieldCls}
                title="Saved provider profiles — switch without re-entering credentials"
              >
                {store.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button onClick={addProfile} className={btnCls} title="Add a new profile">
                ＋
              </button>
              <button onClick={renameProfile} className={btnCls} title="Rename this profile">
                ✎
              </button>
              <button
                onClick={deleteProfile}
                disabled={store.profiles.length <= 1}
                className={btnCls}
                title="Delete this profile"
              >
                🗑
              </button>
            </div>
          </div>
          <label className="col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Provider
            </span>
            <select
              value={presetName}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.name === e.target.value);
                if (p) set({ baseUrl: p.baseUrl, model: p.model });
              }}
              className={fieldCls}
            >
              {[...PRESETS.map((p) => p.name), "Custom"].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              Endpoint (OpenAI-compatible)
            </span>
            <input
              value={profile.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              className={fieldCls}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">API key</span>
            <input
              type="password"
              value={profile.apiKey}
              // API keys contain no whitespace — strip any spaces/line breaks
              // picked up when copy-pasting (a space inside the key makes
              // OpenRouter answer "Missing Authentication header" 401)
              onChange={(e) => set({ apiKey: e.target.value.replace(/\s+/g, "") })}
              className={fieldCls}
              placeholder="sk-… (empty for Ollama)"
            />
          </label>
          <div className="relative col-span-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Model</span>
            <div ref={pickerRef} className="relative">
              <input
                value={profile.model}
                onChange={(e) => set({ model: e.target.value })}
                className={`${fieldCls} pr-7`}
                placeholder="gpt-4o-mini"
                onFocus={() => setPickerOpen(true)}
              />
              <button
                onClick={() => {
                  setPickerOpen((v) => !v);
                  if (!pickerOpen) setTimeout(() => filterRef.current?.focus(), 30);
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-neutral-500 hover:text-amber-300"
                title="Pick a model from the endpoint's list"
              >
                ▾
              </button>
              {pickerOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 flex max-h-56 flex-col overflow-hidden rounded border border-neutral-700 bg-neutral-900 shadow-xl">
                  <input
                    ref={filterRef}
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    className="shrink-0 border-b border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-amber-500"
                    placeholder="Search models… (e.g. gemma, glm, gpt)"
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {modelsLoading ? (
                      <p className="px-2 py-3 text-center text-[11px] text-neutral-500">
                        Loading models…
                      </p>
                    ) : filtered.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-neutral-500">
                        No models found. Check the endpoint or refresh.
                      </p>
                    ) : (
                      filtered.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            set({ model: m.id });
                            setPickerOpen(false);
                            setModelFilter("");
                          }}
                          className={`block w-full px-2 py-1 text-left hover:bg-neutral-800 ${
                            profile.model === m.id ? "bg-amber-950/40" : ""
                          }`}
                          title={m.name}
                        >
                          <span className="block font-mono text-[11px] text-neutral-200">
                            {m.id}
                          </span>
                          <span className="block truncate text-[10px] text-neutral-500">
                            {m.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => void loadModels()}
                    className="shrink-0 border-t border-neutral-700 px-2 py-1 text-left text-[10px] text-neutral-500 hover:text-amber-300"
                  >
                    ↻ Refresh model list
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <button onClick={() => void runTest()} disabled={test === "running"} className={btnCls}>
              {test === "running" ? "Testing…" : "Test connection"}
            </button>
            {test !== "idle" && test !== "running" && (
              <span
                className={`text-[11px] ${test.ok ? "text-emerald-400" : "text-red-400"}`}
              >
                {test.ok
                  ? `✓ Connected — ${profile.model} responded in ${test.ms}ms`
                  : `✗ ${test.reason}`}
              </span>
            )}
          </div>
          <p className="col-span-2 text-[11px] leading-snug text-neutral-500">
            The key is stored only in this browser (localStorage, not encrypted) and sent only
            to the endpoint above.
          </p>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-2 text-xs leading-relaxed text-neutral-400">
            <p className="text-neutral-300">Ask me to design, extend, or fix your project.</p>
            <ul className="list-disc space-y-1 pl-4 text-neutral-500">
              <li>“2 CO₂ cylinders, GCE Druva manifold, 1/2 in Dockweiler main, 3 points of use”</li>
              <li>“route the main line 12 m along the floor, then 1 m up to the ceiling”</li>
              <li>“what is in my project right now?”</li>
              <li>“remove the last gauge”</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "app" ? (
            <div
              key={i}
              className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] leading-relaxed text-neutral-500"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={`max-w-[90%] whitespace-pre-wrap rounded px-2.5 py-1.5 text-xs leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-amber-950/60 text-amber-200"
                  : "bg-neutral-800 text-neutral-200"
              }`}
            >
              {m.text}
            </div>
          ),
        )}
        {busy && <div className="text-xs text-neutral-500">AI is thinking…</div>}
      </div>

      <div className="shrink-0 border-t border-neutral-800 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          className={fieldCls}
          placeholder="Describe a change, or ask a question… (Enter to send)"
        />
        <div className="mt-1.5 flex gap-2">
          <button
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="flex-1 rounded border border-amber-700 bg-amber-950/60 px-2 py-1 text-xs text-amber-300 hover:border-amber-500 disabled:opacity-40"
          >
            {busy ? "Working…" : "Send"}
          </button>
          <button onClick={clear} disabled={busy || messages.length === 0} className={btnCls}>
            New chat
          </button>
        </div>
      </div>
    </div>
  );
}
