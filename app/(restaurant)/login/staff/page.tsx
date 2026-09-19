"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initials, colorForId } from "@/lib/avatar";
import { PinModal } from "./pin-modal";
import {
  ACTIVE_RESTAURANT_KEY,
  type ActiveRestaurant,
} from "./session-key";

type Employee = {
  id: string;
  name: string;
  role: string;
};

/**
 * Staff picker — Step 2 of the restaurant login flow.
 *
 * Step 1:
 *   Restaurant email + password
 *   ↓
 *   /api/staff/resolve-restaurant
 *   ↓
 *   restaurantId
 *
 * Step 2:
 *   Select employee
 *   ↓
 *   Enter employee PIN
 *   ↓
 *   /api/staff/login
 *   ↓
 *   Staff session
 *   ↓
 *   Dashboard
 */
export default function StaffPickerPage() {
  const router = useRouter();

  const [restaurant, setRestaurant] =
    useState<ActiveRestaurant | null>(null);

  const [employees, setEmployees] =
    useState<Employee[] | null>(null);

  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem(ACTIVE_RESTAURANT_KEY);

    // Restaurant login has not been completed.
    if (!raw) {
      router.replace("/login");
      return;
    }

    try {
      const active: ActiveRestaurant = JSON.parse(raw);

      if (!active.restaurantId) {
        sessionStorage.removeItem(ACTIVE_RESTAURANT_KEY);
        router.replace("/login");
        return;
      }

      setRestaurant(active);

      /*
       * Load employees using the restaurant ID.
       *
       * We no longer use:
       *   ?slug=...
       *
       * because Step 1 has already identified the exact tenant.
       */
      fetch(
        `/api/staff/employees?restaurantId=${encodeURIComponent(
          active.restaurantId
        )}`
      )
        .then(async (res) => {
          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data.error || "Could not load staff"
            );
          }

          setEmployees(data.employees);
        })
        .catch((e) => {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Could not load staff"
          );
        });
    } catch {
      sessionStorage.removeItem(ACTIVE_RESTAURANT_KEY);
      router.replace("/login");
    }
  }, [router]);

  /**
   * Go back to restaurant login.
   *
   * This removes the restaurant context so another restaurant
   * can sign in.
   */
  function goBack() {
    sessionStorage.removeItem(ACTIVE_RESTAURANT_KEY);
    router.push("/login");
  }

  /**
   * Employee PIN submission.
   */
  async function submitPin(pin: string) {
    if (!restaurant || !selected) return;

    setPinLoading(true);
    setPinError("");

    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          restaurantId: restaurant.restaurantId,
          employeeId: selected.id,
          pin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPinError(
          data.error || "Incorrect PIN — try again"
        );
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Employee login error:", error);

      setPinError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setPinLoading(false);
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

        <h1 className="font-display text-[27px] font-semibold tracking-tight text-ink-strong">
          {restaurant?.name || "Restro Pro"}
        </h1>

        <p className="text-ink-faint text-sm mt-2">
          Select your name on staff to clock in
        </p>
      </div>

      {loadError && (
        <div className="relative z-10 text-center">
          <p className="text-crimson-400 text-sm mb-3">
            {loadError}
          </p>

          <button
            onClick={goBack}
            className="text-xs text-ink-faint hover:text-ink-strong underline"
          >
            ← Back to login
          </button>
        </div>
      )}

      {!loadError &&
        employees === null && (
          <p className="relative z-10 text-ink-faint text-sm">
            Loading staff…
          </p>
        )}

      {!loadError &&
        employees !== null &&
        employees.length === 0 && (
          <div className="relative z-10 text-center">
            <p className="text-ink-faint text-sm mb-3">
              No active staff found for this restaurant yet.
            </p>

            <button
              onClick={goBack}
              className="text-xs text-ink-faint hover:text-ink-strong underline"
            >
              ← Back to login
            </button>
          </div>
        )}

      {!loadError &&
        employees !== null &&
        employees.length > 0 && (
          <>
            <div className="relative z-10 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5 max-w-[660px] w-full">
              {employees.map((emp, i) => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelected(emp);
                    setPinError("");
                  }}
                  style={{
                    animationDelay: `${i * 50}ms`,
                  }}
                  className="emp-card-in bg-surface border border-line rounded-2xl px-3 py-5 text-center shadow-lg transition-transform hover:-translate-y-1 hover:border-chili-500"
                >
                  <div
                    className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center font-display font-bold text-[17px] text-white"
                    style={{
                      background: colorForId(emp.id),
                    }}
                  >
                    {initials(emp.name)}
                  </div>

                  <div className="font-semibold text-[13.5px] text-ink-strong">
                    {emp.name}
                  </div>

                  <div className="text-ink-faint text-[11px] mt-0.5 uppercase tracking-wide capitalize">
                    {emp.role}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={goBack}
              className="relative z-10 text-xs text-ink-faint hover:text-ink-strong underline mt-8"
            >
              Not your restaurant? Go back
            </button>
          </>
        )}

      {selected && (
        <PinModal
          employeeName={selected.name}
          onSubmit={submitPin}
          onClose={() => {
            setSelected(null);
            setPinError("");
          }}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </main>
  );
}
