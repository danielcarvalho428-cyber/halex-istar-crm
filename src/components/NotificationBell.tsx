'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock } from 'lucide-react';

type Overview = {
  notificationCount: number;
  overdue: number;
  dueToday: number;
  latestUpdate: string | null;
};

export default function NotificationBell() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/commercial/overview', { credentials: 'same-origin' })
        .then((response) => response.json())
        .then((result) => { if (result?.ok) setOverview(result.data); })
        .catch(() => {});
    };
    load();
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Abrir notificações"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="notification-trigger relative rounded-lg p-2 transition-colors"
      >
        <Bell size={17} />
        {!!overview?.notificationCount && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
            {overview.notificationCount > 9 ? '9+' : overview.notificationCount}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-panel absolute right-0 z-50 mt-2 w-72 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-amber-700" />
            <p className="text-sm font-bold text-stone-900">Acompanhamento comercial</p>
          </div>
          <div className="mt-3 grid grid-cols-2 border-y border-stone-200">
            <div className="py-3"><p className="text-[9px] font-bold uppercase text-red-600">Atrasadas</p><p className="mt-1 text-xl font-bold text-red-700">{overview?.overdue || 0}</p></div>
            <div className="border-l border-stone-200 py-3 pl-3"><p className="text-[9px] font-bold uppercase text-amber-700">Hoje</p><p className="mt-1 text-xl font-bold text-amber-900">{overview?.dueToday || 0}</p></div>
          </div>
          <Link onClick={() => setOpen(false)} href="/dashboard/comercial/agenda" className="brand-button mt-3 flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold">
            Abrir agenda
          </Link>
          {overview?.latestUpdate && <p className="mt-3 text-[10px] text-stone-500">Dados atualizados em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(overview.latestUpdate))}</p>}
        </div>
      )}
    </div>
  );
}
