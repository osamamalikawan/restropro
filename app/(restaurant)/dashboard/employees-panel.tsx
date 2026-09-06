"use client";
import { useEffect, useState } from "react";
import { readFast, pullAndCache, startBackgroundSync } from "@/lib/sync";

type Employee = { id: string; name: string; role: string; status: string; updated_at?: string };

/** Reference implementation of the local-first read pattern: render instantly from
 *  IndexedDB, then quietly refresh from Supabase and patch the list when it resolves.
 *  Realtime + periodic background sync keep it fresh after that (see lib/sync.ts). */
export function EmployeesPanel({ restaurantId }: { restaurantId: string }) {
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const local = await readFast<Employee>("employees", restaurantId);
      if (!cancelled) setEmployees(local); // instant paint, even offline

      setSyncing(true);
      await pullAndCache("employees", restaurantId);
      const refreshed = await readFast<Employee>("employees", restaurantId);
      if (!cancelled) {
        setEmployees(refreshed);
        setSyncing(false);
      }
    })();

    const stop = startBackgroundSync("employees", restaurantId);
    return () => {
      cancelled = true;
      stop();
    };
  }, [restaurantId]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold">Employees</h2>
        {syncing && <span className="text-xs text-neutral-500">syncing…</span>}
      </div>
      {employees === null ? (
        <p className="text-neutral-500 text-sm">Loading from local cache…</p>
      ) : employees.length === 0 ? (
        <p className="text-neutral-500 text-sm">No employees cached yet — will populate once online.</p>
      ) : (
        <ul className="space-y-2">
          {employees.map((e) => (
            <li key={e.id} className="flex justify-between text-sm border-b border-neutral-800 pb-2">
              <span>{e.name}</span>
              <span className="text-neutral-500 uppercase text-xs">{e.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
