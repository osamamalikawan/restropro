"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_RESTAURANT_KEY } from "./staff/session-key";

/**
 * Restaurant Login — Step 1
 *
 * Authenticates the restaurant using:
 *   restaurants.email
 *   restaurants.password_hash
 *
 * After successful authentication, the restaurant ID is stored in
 * sessionStorage and the user is sent to the employee login screen.
 *
 * Step 2:
 *   /login/staff
 *
 * The employee then authenticates using their PIN.
 */
export default function OwnerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  // If a restaurant has already been resolved during this browser session,
  // skip the restaurant login and go directly to employee login.
  useEffect(() => {
    if (sessionStorage.getItem(ACTIVE_RESTAURANT_KEY)) {
      router.replace("/login/staff");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/staff/resolve-restaurant", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Incorrect email or password.");
        return;
      }

      if (!data.restaurantId) {
        setError("Restaurant information was not returned.");
        return;
      }

      /*
       * Store only the restaurant context.
       *
       * Do NOT store the restaurant password.
       *
       * Employee authentication happens in Step 2.
       */
      sessionStorage.setItem(
        ACTIVE_RESTAURANT_KEY,
        JSON.stringify({
          restaurantId: data.restaurantId,
          slug: data.slug,
          name: data.name,
        })
      );

      router.push("/login/staff");
    } catch (err) {
      console.error("Restaurant login error:", err);
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden bg-canvas">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(650px 420px at 12% 8%, rgba(217,72,31,0.16), transparent 60%), radial-gradient(520px 400px at 88% 92%, rgba(63,110,82,0.10), transparent 60%)",
        }}
      />

      <div className="text-center mb-9 relative z-10">
        <div className="w-[58px] h-[58px] mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chili-400 to-chili-600 flex items-center justify-center shadow-[0_14px_34px_-10px_rgba(217,72,31,0.6)]">
          <span className="font-display italic font-bold text-white text-[23px]">
            RP
          </span>
        </div>

        <h1 className="font-display text-[31px] font-semibold tracking-tight text-ink-strong">
          Restro Pro
        </h1>

        <div className="text-ink-faint text-[12.5px] mt-1 tracking-wide">
          Run Your Restaurant. Smarter.
        </div>

        <p className="text-ink-faint text-sm mt-3">
          Sign in with your restaurant account to continue.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] relative z-10 bg-surface border border-line rounded-2xl p-[26px] shadow-xl space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-ink-mid mb-1.5">
            Restaurant email
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            required
            autoFocus
            autoComplete="email"
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-mid mb-1.5">
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
        </div>

        <p className="text-[11px] text-crimson-400 min-h-[14px]">
          {error}
        </p>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-[12.5px] font-bold py-2.5 mt-1.5 transition-colors"
        >
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
