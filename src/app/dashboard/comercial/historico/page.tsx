'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import CommercialNav from '@/components/CommercialNav';

type AuditEvent = {
  id: string;
  actor_username: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
};

export default function AuditHistoryPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/commercial/overview', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((result) => { if (result?.ok) setEvents(result.data.audits || []); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('pt-BR');
    if (!value) return events;
    return events.filter((event) => [event.actor_username, event.action, event.entity_type, event.summary]
      .join(' ').toLocaleLowerCase('pt-BR').includes(value));
  }, [events, query]);

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Governança</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-950">Histórico de atividades</h1>
        <p className="mt-2 text-sm text-stone-500">Registro verificável das alterações comerciais realizadas no sistema.</p>
      </header>
      <CommercialNav />
      <label className="relative block">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input w-full pl-9" placeholder="Buscar por usuário, ação ou descrição..." />
      </label>
      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-900/8 p-4">
          <Activity size={17} className="text-amber-700" />
          <h2 className="font-semibold text-stone-900">Eventos recentes</h2>
        </div>
        {loading ? <p className="p-5 text-sm text-stone-500">Carregando histórico...</p> : (
          <div className="divide-y divide-stone-900/8">
            {filtered.length === 0 ? (
              <div className="p-8 text-center"><p className="font-semibold text-stone-800">Nenhuma atividade registrada ainda.</p><p className="mt-1 text-sm text-stone-500">Novos contatos, tarefas e oportunidades aparecerão aqui automaticamente.</p></div>
            ) : filtered.map((event) => (
              <article key={event.id} className="grid gap-2 p-4 md:grid-cols-[160px_150px_1fr] md:items-start">
                <p className="text-xs font-semibold text-stone-600">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at))}</p>
                <div><p className="text-xs font-bold text-stone-800">{event.actor_username}</p><p className="mt-0.5 text-[10px] uppercase text-stone-400">{event.actor_role}</p></div>
                <div><p className="text-sm font-semibold text-stone-900">{event.summary}</p><p className="mt-1 text-[10px] text-stone-500">{event.action} · {event.entity_type}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
