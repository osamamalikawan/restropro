"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "./pin-pad";

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
    setPassword(""); // don't keep it in memory longer than needed
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
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
        <h1 className="font-display text-xl font-semibold text-center">Restro Pro</h1>

        {step === "credentials" ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <p className="text-neutral-400 text-sm text-center">Sign in with your restaurant's account.</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
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
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>
        ) : (
          <div>
            <div className="text-center mb-5">
              <p className="font-semibold">{restaurantName}</p>
              <p className="text-neutral-400 text-sm mt-1">Enter your PIN</p>
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setError("");
                }}
                className="text-xs text-neutral-500 hover:text-neutral-300 underline mt-2"
              >
                Not your restaurant? Go back
              </button>
            </div>
            <PinPad onSubmit={handlePinSubmit} loading={loading} />
            {error && <p className="text-crimson-400 text-sm text-center mt-4">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
