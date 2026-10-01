'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { desktopHome } from '@/lib/desktop/context';

type Employee = { id: string; name: string; role: string };

export default function StaffPickerPage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState('');
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    invoke<{ restaurant_name: string } | null>('get_device_info').then((info) => {
      if (!info) { router.replace('/login'); return; }
      setRestaurantName(info.restaurant_name);
      invoke<Employee[]>('get_cached_staff_list').then(setEmployees);
    });
  }, [router]);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setPinLoading(true);
    setPinError('');
    try {
      await invoke('verify_staff_pin', { employeeId: selected.id, pin });
      router.push(await desktopHome());
    } catch (err) {
      setPinError(typeof err === 'string' ? err : 'Incorrect PIN — try again');
      setPin('');
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <h1 className="font-display text-[27px] font-semibold mb-2">{restaurantName || 'Restro Pro'}</h1>
      <p className="text-sm mb-8">Select your name on staff to clock in</p>

      {employees === null && <p>Loading staff…</p>}

      {employees !== null && !selected && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5 max-w-[660px]">
          {employees.map((emp) => (
            <button key={emp.id} onClick={() => setSelected(emp)}
              className="bg-surface border border-line rounded-2xl px-3 py-5 text-center">
              <div className="font-semibold text-[13.5px]">{emp.name}</div>
              <div className="text-[11px] mt-0.5 uppercase">{emp.role}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <form onSubmit={submitPin} className="w-full max-w-[280px] space-y-3">
          <p className="text-center text-sm">Hi {selected.name.split(' ')[0]} — enter PIN</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
            className="w-full text-center text-2xl tracking-[0.5em] rounded-lg bg-raised border border-line py-3"
          />
          <p className="text-[11px] text-crimson-400 text-center min-h-[14px]">{pinError}</p>
          <button type="submit" disabled={pinLoading || pin.length !== 4}
            className="w-full rounded-lg bg-chili-500 text-white text-[12.5px] font-bold py-2.5">
            {pinLoading ? 'Checking…' : 'Go'}
          </button>
          <button type="button" onClick={() => { setSelected(null); setPin(''); }}
            className="w-full text-xs underline">
            Not you?
          </button>
        </form>
      )}
    </main>
  );
}