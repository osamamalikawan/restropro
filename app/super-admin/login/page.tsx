"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(650px 420px at 12% 8%, rgba(217,72,31,0.12), transparent 60%), radial-gradient(520px 400px at 88% 92%, rgba(63,110,82,0.10), transparent 60%)",
        }}
      />
      <div className="absolute top-5 right-5 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chili-400 to-chili-600 flex items-center justify-center shadow-lg shadow-chili-500/30">
            <span className="font-display italic font-bold text-white text-xl">RP</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-strong">Restro Pro</h1>
          <p className="text-ink-faint text-xs uppercase tracking-wide mt-1">Super Admin Console</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-surface p-6 space-y-4 shadow-xl">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md bg-raised border border-line px-3 py-2.5 text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md bg-raised border border-line px-3 py-2.5 text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
          {error && <p className="text-crimson-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-xs text-ink-faint mt-6">
          Restaurant staff? <a href="/login" className="text-chili-400 hover:underline">Go to Restaurant Login →</a>
        </p>
      </div>
    </main>
  );
}
