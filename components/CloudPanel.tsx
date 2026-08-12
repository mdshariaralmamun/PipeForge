"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAssembly } from "@/lib/assembly";
import {
  deleteProject,
  listProjects,
  loadProjectData,
  saveProjectAs,
  updateProject,
  type CloudProjectMeta,
} from "@/lib/cloud";
import { parseProject } from "@/lib/project";
import { useSession } from "@/lib/useSession";

const btnCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";
const fieldCls =
  "rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-amber-500";

// Cloud projects dialog: save the current design to the account, open, delete.
export default function CloudPanel() {
  const open = useAssembly((s) => s.cloudOpen);
  const setCloudOpen = useAssembly((s) => s.setCloudOpen);
  const cloudId = useAssembly((s) => s.cloudId);
  const cloudName = useAssembly((s) => s.cloudName);
  const setCloudRef = useAssembly((s) => s.setCloudRef);
  const { user } = useSession();

  const [projects, setProjects] = useState<CloudProjectMeta[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (open && user) void refresh();
  }, [open, user, refresh]);

  if (!open) return null;

  const currentData = () => {
    const s = useAssembly.getState();
    return { placed: s.placed, customDefs: s.customDefs };
  };

  const doSaveAs = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await saveProjectAs(name.trim(), currentData());
      setCloudRef(id, name.trim());
      useAssembly.getState().say(`Saved to cloud as "${name.trim()}".`);
      setName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doUpdate = async () => {
    if (!cloudId || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateProject(cloudId, currentData());
      useAssembly.getState().say(`Cloud project "${cloudName}" updated.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doOpen = async (p: CloudProjectMeta) => {
    setError("");
    try {
      const data = await loadProjectData(p.id);
      const parsed = parseProject(JSON.stringify(data));
      if (!parsed) throw new Error("corrupt project data");
      const st = useAssembly.getState();
      if (parsed.customDefs.length > 0) st.mergeCustomDefs(parsed.customDefs);
      st.loadProject(parsed.placed);
      st.setCloudRef(p.id, p.name);
      st.say(`Opened "${p.name}" (${parsed.placed.length} parts).`);
      setCloudOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doDelete = async (p: CloudProjectMeta) => {
    if (!window.confirm(`Delete cloud project "${p.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteProject(p.id);
      if (cloudId === p.id) setCloudRef(null, null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-6">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-100">Cloud projects</h2>
          <button onClick={() => setCloudOpen(false)} className={btnCls}>
            Close
          </button>
        </div>

        {!user ? (
          <p className="text-sm text-neutral-400">
            Sign in to save projects to your account —{" "}
            <Link href="/login" className="text-amber-400 hover:underline">
              Sign in
            </Link>
          </p>
        ) : (
          <>
            {cloudId && (
              <div className="flex items-center justify-between gap-2 rounded border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs">
                <span className="truncate text-amber-200">Open: {cloudName}</span>
                <button onClick={doUpdate} disabled={busy} className={btnCls}>
                  Save changes
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New project name…"
                className={`${fieldCls} min-w-0 flex-1`}
              />
              <button onClick={doSaveAs} disabled={busy || !name.trim()} className={btnCls}>
                Save as
              </button>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="max-h-64 overflow-y-auto rounded border border-neutral-800">
              {projects.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-neutral-500">
                  No cloud projects yet.
                </p>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 border-b border-neutral-800/60 px-3 py-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-neutral-200">{p.name}</div>
                      <div className="text-[10px] text-neutral-500">
                        {new Date(p.updated_at).toLocaleString()}
                        {p.id === cloudId ? " · open" : ""}
                      </div>
                    </div>
                    <button onClick={() => void doOpen(p)} className={btnCls}>
                      Open
                    </button>
                    <button onClick={() => void doDelete(p)} className={btnCls}>
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
