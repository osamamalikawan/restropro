"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !data.user) {
      setError(signInError?.message || "Sign in failed");
      setLoading(false);
      return;
    }
    const { data: superAdminRow } = await supabase
      .from("super_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .single();
    if (!superAdminRow) {
      await supabase.auth.signOut();
      setError("This account is not a Super Admin.");
      setLoading(false);
      return;
    }
    router.push("/super-admin/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
        <h1 className="font-display text-xl font-semibold text-center">Super Admin</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
        />
        {error && <p className="text-crimson-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
