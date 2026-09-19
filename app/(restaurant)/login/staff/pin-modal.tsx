"use client";
import { useEffect, useState } from "react";
import { PinPad } from "../pin-pad";

export function PinModal({
  employeeName,
  onSubmit,
  onClose,
  loading,
  error,
}: {
  employeeName: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  // Remounts the pad (and clears the dots) every time the modal reopens for a new employee
  // or after a failed attempt, matching the prototype's openPin()/pressPin() reset behaviour.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt((a) => a + 1);
  }, [error]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[340px] rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">
            Hi {employeeName.split(" ")[0]} — enter PIN
          </h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink-strong text-sm">
            ✕
          </button>
        </div>
        <div className="p-6">
          <PinPad key={attempt} onSubmit={onSubmit} loading={loading} />
          <p className="text-[11px] text-crimson-400 text-center mt-3.5 min-h-[14px]">{error}</p>
        </div>
      </div>
    </div>
  );
}
