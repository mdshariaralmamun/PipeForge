"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "./supabase/client";

export interface SessionState {
  configured: boolean; // Supabase env vars present
  loading: boolean;
  user: User | null;
  role: "user" | "admin" | null;
}

// Lightweight session hook: current user + role from the profiles table.
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() => {
    const configured = isSupabaseConfigured();
    return { configured, loading: configured, user: null, role: null };
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) return; // local-only mode, nothing to load
    const supabase = createClient();
    let mounted = true;

    const loadRole = async (user: User | null): Promise<"user" | "admin" | null> => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      return data?.role === "admin" ? "admin" : "user";
    };

    supabase.auth.getUser().then(async ({ data }) => {
      const role = await loadRole(data.user);
      if (mounted) setState({ configured: true, loading: false, user: data.user, role });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      // Deferred: supabase-js warns against async work inside the callback.
      setTimeout(async () => {
        const role = await loadRole(user);
        if (mounted) setState({ configured: true, loading: false, user, role });
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
