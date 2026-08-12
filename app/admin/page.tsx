"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listProjects, type CloudProjectMeta } from "@/lib/cloud";
import {
  fetchPendingItems,
  reviewCatalogItem,
  type CatalogItem,
} from "@/lib/cloudCatalog";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/useSession";

const tabCls = (active: boolean) =>
  `rounded px-3 py-1.5 text-xs ${active ? "bg-amber-950/60 text-amber-300 border border-amber-700" : "border border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500"}`;

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="space-y-3 text-center text-sm text-neutral-300">
        {children}
        <div>
          <Link href="/" className="text-amber-400 hover:underline">
            ← Back to the app
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { configured, loading, user, role } = useSession();
  const [tab, setTab] = useState<"catalog" | "projects" | "users">("catalog");
  const [pending, setPending] = useState<CatalogItem[]>([]);
  const [projects, setProjects] = useState<CloudProjectMeta[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [error, setError] = useState("");

  const isAdmin = configured && !loading && !!user && role === "admin";

  const loadCatalog = useCallback(async () => {
    try {
      setPending(await fetchPendingItems());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchPendingItems();
        if (!cancelled) setPending(items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      try {
        const list = await listProjects();
        if (!cancelled) setProjects(list);
      } catch {
        /* optional tab data */
      }
      try {
        const { data } = await createClient()
          .from("profiles")
          .select("id, email, display_name, role, created_at")
          .order("created_at");
        if (!cancelled) setUsers((data ?? []) as ProfileRow[]);
      } catch {
        /* optional tab data */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!configured) return <Shell>Accounts are not configured on this deployment.</Shell>;
  if (loading) return <Shell>Loading…</Shell>;
  if (!user)
    return (
      <Shell>
        Sign in first —{" "}
        <Link href="/login" className="text-amber-400 hover:underline">
          Sign in
        </Link>
      </Shell>
    );
  if (role !== "admin") return <Shell>Admins only.</Shell>;

  const review = async (item: CatalogItem, status: "approved" | "rejected") => {
    const note =
      status === "rejected" ? (window.prompt("Reason (optional)") ?? "") : "";
    try {
      await reviewCatalogItem(item.id, status, note || undefined);
      await loadCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-200">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            Pipe<span className="text-amber-400">Forge</span> admin
          </h1>
          <div className="flex-1" />
          <Link href="/" className="text-xs text-amber-400 hover:underline">
            ← Back to the app
          </Link>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => setTab("catalog")} className={tabCls(tab === "catalog")}>
            Catalog queue ({pending.length})
          </button>
          <button onClick={() => setTab("projects")} className={tabCls(tab === "projects")}>
            All projects ({projects.length})
          </button>
          <button onClick={() => setTab("users")} className={tabCls(tab === "users")}>
            Users ({users.length})
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {tab === "catalog" && (
          <div className="mt-4 rounded border border-neutral-800">
            {pending.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-neutral-500">
                No submissions waiting for review.
              </p>
            ) : (
              pending.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-amber-400/90">
                      {item.def.partNumber}
                    </div>
                    <div className="truncate text-xs text-neutral-300">
                      {item.def.description}
                    </div>
                    <div className="mt-0.5 text-[10px] text-neutral-500">
                      {item.def.brand} · {item.def.sizeLabel} · submitted{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => void review(item, "approved")}
                    className="rounded border border-green-800 bg-green-950/50 px-2.5 py-1 text-xs text-green-300 hover:border-green-500"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => void review(item, "rejected")}
                    className="rounded border border-red-900 bg-red-950/50 px-2.5 py-1 text-xs text-red-300 hover:border-red-600"
                  >
                    Reject
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "projects" && (
          <div className="mt-4 rounded border border-neutral-800">
            {projects.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-neutral-500">
                No cloud projects yet.
              </p>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1 truncate text-xs text-neutral-200">
                    {p.name}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-500">
                    {p.owner_id.slice(0, 8)}…
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "users" && (
          <div className="mt-4">
            <div className="rounded border border-neutral-800">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 border-b border-neutral-800/60 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1 truncate text-xs text-neutral-200">
                    {u.email}
                  </div>
                  <div className="text-xs text-neutral-400">{u.display_name}</div>
                  <div
                    className={`rounded px-1.5 py-0.5 text-[10px] ${u.role === "admin" ? "bg-amber-900/60 text-amber-300" : "bg-neutral-800 text-neutral-400"}`}
                  >
                    {u.role}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              Role changes run as SQL in the Supabase dashboard (see SUPABASE_SETUP.md).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
