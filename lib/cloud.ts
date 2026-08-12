// Cloud projects via Supabase: per-user saves. RLS on the server enforces
// owner scope; admins can read/update/delete all projects.
import type { ProjectFile } from "./project";
import { createClient } from "./supabase/client";

export interface CloudProjectMeta {
  id: string;
  name: string;
  updated_at: string;
  owner_id: string;
}

export async function listProjects(): Promise<CloudProjectMeta[]> {
  const { data, error } = await createClient()
    .from("projects")
    .select("id, name, updated_at, owner_id")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveProjectAs(name: string, data: ProjectFile): Promise<string> {
  const supabase = createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const { data: row, error } = await supabase
    .from("projects")
    .insert({ name, data, owner_id: userData.user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateProject(id: string, data: ProjectFile): Promise<void> {
  const { error } = await createClient()
    .from("projects")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadProjectData(id: string): Promise<ProjectFile> {
  const { data, error } = await createClient()
    .from("projects")
    .select("data")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return (data as { data: ProjectFile }).data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await createClient().from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
