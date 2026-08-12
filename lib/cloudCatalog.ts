// Shared system catalog via Supabase: users submit part definitions, admin
// approves them, and approved defs are served to everyone (read-only, "sealed").
import type { ComponentDef } from "./types";
import { createClient } from "./supabase/client";

export type CatalogStatus = "pending" | "approved" | "rejected";

export interface CatalogItem {
  id: string;
  def: ComponentDef;
  status: CatalogStatus;
  reviewer_note: string | null;
  created_at: string;
  submitted_by: string;
}

export async function submitCatalogDefs(defs: ComponentDef[]): Promise<number> {
  const supabase = createClient();
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error("Sign in to submit parts");
  const rows = defs.map((def) => ({ def, submitted_by: u.user!.id }));
  const { error } = await supabase.from("catalog_items").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function fetchApprovedDefs(): Promise<ComponentDef[]> {
  const { data, error } = await createClient()
    .from("catalog_items")
    .select("def")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { def: ComponentDef }).def);
}

export async function fetchMySubmissions(): Promise<CatalogItem[]> {
  const { data, error } = await createClient()
    .from("catalog_items")
    .select("id, def, status, reviewer_note, created_at, submitted_by")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogItem[];
}

// Admin: pending queue (RLS lets admins read all rows).
export async function fetchPendingItems(): Promise<CatalogItem[]> {
  const { data, error } = await createClient()
    .from("catalog_items")
    .select("id, def, status, reviewer_note, created_at, submitted_by")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogItem[];
}

export async function reviewCatalogItem(
  id: string,
  status: "approved" | "rejected",
  note?: string,
): Promise<void> {
  const { error } = await createClient()
    .from("catalog_items")
    .update({ status, reviewer_note: note ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
