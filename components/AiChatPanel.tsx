"use client";

import { useEffect, useRef, useState } from "react";
import { useAssembly } from "@/lib/assembly";
import { useAiChat } from "@/lib/aiChat";
import { loadAiSettings, saveAiSettings, type AiSettings } from "@/lib/ai";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

// Provider presets: picking one fills endpoint + model; the key is preserved.
const PRESETS: { name: string; baseUrl: string; model: string }[] = [
  { name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "gpt-oss:20b" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
];

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

  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => hydrate(), [hydrate]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const set = (patch: Partial<AiSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveAiSettings(next);
      return next;
    });

  const presetName =
    PRESETS.find((p) => p.baseUrl === settings.baseUrl)?.name ?? "Custom";

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void send(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          AI chat
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`text-xs ${showSettings ? "text-amber-300" : "text-neutral-500"} hover:text-amber-300`}
            title="Provider, API key and model"
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
              value={settings.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              className={fieldCls}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">API key</span>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              className={fieldCls}
              placeholder="sk-… (empty for Ollama)"
            />
          </label>
          <label>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Model</span>
            <input
              value={settings.model}
              onChange={(e) => set({ model: e.target.value })}
              className={fieldCls}
              placeholder="gpt-4o-mini"
            />
          </label>
          <p className="col-span-2 text-[11px] leading-snug text-neutral-500">
            The key is stored only in this browser (localStorage) and sent only to the endpoint
            above.
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
