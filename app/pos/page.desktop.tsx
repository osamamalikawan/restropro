'use client';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PosClient } from './pos-client';

interface LocalSession {
  restaurant_id: string;
  restaurant_name: string;
  name: string;
}

export default function PosPage() {
  const [ctx, setCtx] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<LocalSession | null>('get_local_session')
      .then((session) => {
        if (!session) { window.location.href = '/login'; return; }
        setCtx(session);
      })
      .catch(() => { window.location.href = '/login'; })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !ctx) return null;

  return (
    <PosClient
      restaurantId={ctx.restaurant_id}
      restaurantName={ctx.restaurant_name}
      cashierName={ctx.name}
    />
  );
}