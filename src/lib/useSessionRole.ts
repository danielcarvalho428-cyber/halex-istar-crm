'use client';

import { useEffect, useState } from 'react';
import type { AccountRole } from '@/types';

export function useSessionRole() {
  const [role, setRole] = useState<AccountRole>('viewer');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((result) => {
        if (!mounted || !result?.ok) return;
        setRole(result.data.role === 'admin' ? 'admin' : 'viewer');
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { role, isAdmin: role === 'admin', loading };
}
