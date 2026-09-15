"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Table = { id: string; number: string; seats: number; is_active: boolean };
type Area = { id: string; name: string; delivery_fee: number; is_active: boolean };

export function TablesDeliveryClient() {
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tableNo, setTableNo] = useState("");
  const [tableSeats, setTableSeats] = useState("4");
  const [areaName, setAreaName] = useState("");
  const [areaFee, setAreaFee] = useState("0");
  const [error, setError] = useState("");

  async function loadAll() {
    const [tRes, aRes] = await Promise.all([fetch("/api/tables"), fetch("/api/delivery-areas")]);
    const tData = await tRes.json();
    const aData = await aRes.json();
    if (tRes.ok) setTables(tData.tables ?? []);
    if (aRes.ok) setAreas(aData.areas ?? []);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function addTable() {
    if (!tableNo.trim()) return;
    setError("");
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { number: tableNo.trim(), seats: Number(tableSeats), is_active: true } }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setTableNo("");
    loadAll();
  }
  async function removeTable(id: string) {
    await fetch("/api/tables", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "delete", row: { id } }) });
    loadAll();
  }

  async function addArea() {
    if (!areaName.trim()) return;
    setError("");
    const res = await fetch("/api/delivery-areas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "insert", row: { name: areaName.trim(), delivery_fee: Number(areaFee), is_active: true } }),
    });
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setAreaName("");
    setAreaFee("0");
    loadAll();
  }
  async function removeArea(id: string) {
    await fetch("/api/delivery-areas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "delete", row: { id } }) });
    loadAll();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold">Tables &amp; Delivery Areas</h1>
        <Link href="/dashboard" className="text-xs text-neutral-400 underline hover:text-neutral-200">
          ← Dashboard
        </Link>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-4">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-display font-semibold mb-3">Tables</h2>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {tables.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-neutral-800 pb-2">
                <span>
                  Table {t.number} <span className="text-neutral-500">({t.seats} seats)</span>
                </span>
                <button onClick={() => removeTable(t.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
            {tables.length === 0 && <p className="text-neutral-500 text-sm">No tables yet.</p>}
          </div>
          <div className="flex gap-2">
            <input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="e.g. 12" className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
            <input value={tableSeats} onChange={(e) => setTableSeats(e.target.value)} type="number" placeholder="Seats" className="w-20 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
            <button onClick={addTable} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-3">
              Add
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-display font-semibold mb-3">Delivery areas</h2>
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {areas.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b border-neutral-800 pb-2">
                <span>
                  {a.name} <span className="text-neutral-500">— fee Rs {a.delivery_fee}</span>
                </span>
                <button onClick={() => removeArea(a.id)} className="text-neutral-500 hover:text-crimson-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
            {areas.length === 0 && <p className="text-neutral-500 text-sm">No areas yet.</p>}
          </div>
          <div className="flex gap-2">
            <input value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="e.g. Gulgasht Colony" className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
            <input value={areaFee} onChange={(e) => setAreaFee(e.target.value)} type="number" placeholder="Fee" className="w-20 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
            <button onClick={addArea} className="rounded-md bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-3">
              Add
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
