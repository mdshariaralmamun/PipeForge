"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const fieldCls =
  "w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-amber-500";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="text-lg font-semibold text-neutral-100">
          Pipe<span className="text-amber-400">Forge</span> — Sign in
        </div>

        {!configured ? (
          <p className="mt-4 text-sm text-neutral-400">
            Accounts are not configured on this deployment. The designer works fully without
            an account —{" "}
            <Link href="/" className="text-amber-400 hover:underline">
              back to the app
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={fieldCls}
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={fieldCls}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded border border-amber-700 bg-amber-950/60 px-3 py-2 text-sm text-amber-300 hover:border-amber-500 disabled:opacity-40"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <Link href="/register" className="hover:text-amber-300">
                Create an account
              </Link>
              <Link href="/" className="hover:text-amber-300">
                Continue as guest
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
