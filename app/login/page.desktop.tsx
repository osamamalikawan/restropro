'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';

export default function OwnerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    invoke('get_device_info').then((info) => {
      if (info) {
        router.replace('/login/staff');
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await invoke('activate_device', { email, password });
      router.push('/login/staff');
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not activate this device');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="text-center mb-9">
        <h1 className="font-display text-[31px] font-semibold">Restro Pro</h1>
        <p className="text-sm mt-3">Activate this device — sign in with your restaurant account.</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-[360px] bg-surface border border-line rounded-2xl p-[26px] space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5">Restaurant email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm" />
        </div>
        <p className="text-[11px] text-crimson-400 min-h-[14px]">{error}</p>
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-chili-500 text-white text-[12.5px] font-bold py-2.5">
          {loading ? 'Activating…' : 'Activate this device'}
        </button>
      </form>
    </main>
  );
}