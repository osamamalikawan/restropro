"use client";
import { useState } from "react";

/** The PIN pad from the original HTML prototype: dot indicators showing how many digits have
 *  been entered, plus a 4x3 number grid (1-9, Clear, 0, Go) — not a masked text input. */
export function PinPad({
  onSubmit,
  loading,
}: {
  onSubmit: (pin: string) => void;
  loading: boolean;
}) {
  const [pin, setPin] = useState("");

  function press(key: string) {
    if (key === "clr") {
      setPin("");
      return;
    }
    if (key === "ok") {
      if (pin.length === 4) onSubmit(pin);
      return;
    }
    if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 150);
      }
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "ok"];

  return (
    <div>
      <div className="flex justify-center gap-2.5 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < pin.length ? "bg-chili-500 border-chili-500" : "border-neutral-700"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={loading}
            onClick={() => press(k)}
            className={`aspect-square rounded-full flex items-center justify-center text-lg font-semibold border border-neutral-700 transition-colors disabled:opacity-40 ${
              k === "clr" || k === "ok"
                ? "text-neutral-400 text-xs bg-neutral-800 hover:bg-neutral-700"
                : "bg-neutral-800 hover:bg-neutral-700 text-neutral-50"
            }`}
          >
            {k === "clr" ? "Clear" : k === "ok" ? "Go" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
