"use client";

import { useState } from "react";
import { useAssembly } from "@/lib/assembly";
import {
  findDefByPart,
  loadAiSettings,
  runAiPrompt,
  saveAiSettings,
  type AiSettings,
} from "@/lib/ai";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";
const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

// AI prompt-to-project panel (BYOK — the key stays in this browser only).
export default function AiPanel() {
  const open = useAssembly((s) => s.aiOpen);
  const setAiOpen = useAssembly((s) => s.setAiOpen);
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  if (!open) return null;

  const set = (patch: Partial<AiSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const run = async () => {
    if (!prompt.trim() || busy) return;
    const local =
      settings.baseUrl.includes("localhost") || settings.baseUrl.includes("127.0.0.1");
    if (!settings.apiKey.trim() && !local) {
      setLog((l) => [...l, "Add your API key first — or use a local endpoint (Ollama)."]);
      return;
    }
    setBusy(true);
    setLog((l) => [...l, `> ${prompt.trim()}`, "AI is designing…"]);
    try {
      saveAiSettings(settings);
      const steps = await runAiPrompt(settings, prompt.trim());
      const skipped: string[] = [];
      useAssembly.getState().clearAll();
      let count = 0;
      for (const step of steps) {
        const def = findDefByPart(step.part);
        if (!def) {
          skipped.push(step.part);
          continue;
        }
        useAssembly.getState().placePart(def.id);
        const after = useAssembly.getState();
        if (after.notice) {
          // joint refused — break the chain and continue with the next step
          skipped.push(step.part);
          after.clearNotice();
          after.clearActivePort();
          continue;
        }
        if (step.length) after.setSelectedLength(step.length);
        // Keep the chain alive: the snap path auto-advances the active port,
        // the drop path does not — activate this part's outlet port.
        const cur = useAssembly.getState();
        if (!cur.activePort && cur.selectedUid) {
          const free =
            def.ports.find((p) => p.id === "p2") ?? def.ports[def.ports.length - 1];
          if (free) cur.setActivePort(cur.selectedUid, free.id);
        }
        count++;
      }
      useAssembly
        .getState()
        .say(`AI placed ${count} part${count === 1 ? "" : "s"}${skipped.length ? ` — skipped ${skipped.length} (unknown/refused)` : ""}.`);
      setLog((l) => [
        ...l,
        `Done: ${count} parts placed.${skipped.length ? ` Skipped: ${skipped.join(", ").slice(0, 220)}` : ""}`,
      ]);
      if (count > 0) {
        useAssembly.getState().zoomFit();
        setAiOpen(false);
      }
    } catch (e) {
      setLog((l) => [...l, `Error: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-6">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">
            AI designer <span className="text-neutral-500">— prompt to complete project</span>
          </h2>
          <button onClick={() => setAiOpen(false)} className={btnCls}>
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
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
              placeholder="sk-…"
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
        </div>
        <p className="text-[11px] leading-snug text-neutral-500">
          Your key is stored only in this browser (localStorage) and sent only to the endpoint
          above. Works with OpenAI, OpenRouter, Groq, or local Ollama
          (http://localhost:11434/v1, key can stay empty).
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className={fieldCls}
          placeholder="e.g. 1/4 in UHP nitrogen stick: DW tube 12 in, weld elbow, diaphragm valve, EMD point-of-use regulator, gauge, VCR cap at the end"
        />
        <button
          onClick={run}
          disabled={busy || !prompt.trim()}
          className="w-full rounded border border-amber-700 bg-amber-950/60 px-2 py-1.5 text-xs text-amber-300 hover:border-amber-500 disabled:opacity-40"
        >
          {busy ? "Designing…" : "Generate project"}
        </button>

        {log.length > 0 && (
          <div className="max-h-36 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-[11px] leading-relaxed text-neutral-400">
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
