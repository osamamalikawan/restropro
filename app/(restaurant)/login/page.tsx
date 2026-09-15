"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "./pin-pad";
import { ThemeToggle } from "@/components/theme-toggle";

export default function StaffLoginPage() {
  const [step, setStep] = useState<"credentials" | "pin">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/staff/resolve-restaurant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not sign in");
      return;
    }
    setRestaurantSlug(data.slug);
    setRestaurantName(data.name);
    setPassword("");
    setStep("pin");
  }

  async function handlePinSubmit(pin: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantSlug, pin }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Incorrect PIN — try again");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12 relative overflow-hidden">
      {/* soft brand-color glow, matching the prototype's login background treatment */}
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
          <p className="text-ink-faint text-xs uppercase tracking-wide mt-1">Run your restaurant. Smarter.</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-xl">
          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <p className="text-ink-faint text-sm text-center">Sign in with your restaurant's account.</p>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
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
              {error && <p className="text-crimson-400 text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5 transition-colors"
              >
                {loading ? "Signing in…" : "Continue"}
              </button>
            </form>
          ) : (
            <div>
              <div className="text-center mb-5">
                <p className="font-display font-semibold text-ink-strong">{restaurantName}</p>
                <p className="text-ink-faint text-sm mt-1">Enter your PIN</p>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setError("");
                  }}
                  className="text-xs text-ink-faint hover:text-ink-strong underline mt-2"
                >
                  Not your restaurant? Go back
                </button>
              </div>
              <PinPad onSubmit={handlePinSubmit} loading={loading} />
              {error && <p className="text-crimson-400 text-sm text-center mt-4">{error}</p>}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-faint mt-6">
          Platform owner? <a href="/super-admin/login" className="text-chili-400 hover:underline">Go to Super Admin →</a>
        </p>
      </div>
    </main>
  );
}
