'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  History,
  UploadCloud,
} from 'lucide-react';
import { db } from '@/lib/db';
import type { AuditEvent } from '@/types';

const importCards = [
  {
    href: '/dashboard/import/halex-powerbi',
    title: 'Power BI Halex',
    description: 'Atualiza pregoes abertos no periodo, sem alterar registros existentes.',
    icon: UploadCloud,
  },
  {
    href: '/dashboard/import/empenhos-lote',
    title: 'Empenhos em lote',
    description: 'Le um Excel com muitas NFs e mapeia automaticamente para os pregoes.',
    icon: FileSpreadsheet,
  },
];

const checklist = [
  'Exportar backup antes de importacoes grandes.',
  'Conferir filtro por data de abertura, nao por vencimento.',
  'Revisar NFs sem correspondencia ou com baixa confianca.',
  'Usar reconciliacao de saldos depois da importacao.',
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function ImportHubPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    db.getAuditEvents({ actionPrefix: 'import.', limit: 40 })
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o historico.'))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const imported = events.reduce((sum, event) => sum + Number(event.metadata?.imported || 0), 0);
    const failed = events.reduce((sum, event) => sum + Number(event.metadata?.failed || 0), 0);
    return { imported, failed, total: events.length };
  }, [events]);

  return (
    <div className="space-y-6 pb-12">
      <header className="page-hero">
        <p className="lumina-kicker">Operacao</p>
        <h1 className="mt-2 text-3xl font-semibold">Central de importacoes</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Um ponto unico para importar dados, revisar historico e seguir o pre-voo operacional.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {importCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="glass-card group flex min-h-36 flex-col justify-between p-5 transition-all hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-stone-900">{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">{card.description}</p>
                </div>
                <span className="metric-icon shrink-0">
                  <Icon size={18} />
                </span>
              </div>
              <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-amber-800">
                Abrir importador
                <ArrowRight size={14} />
              </span>
            </Link>
          );
        })}
      </section>

      <section className="metric-strip grid grid-cols-1 md:grid-cols-3">
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Eventos recentes</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{stats.total}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">NFs importadas</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{stats.imported}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Falhas registradas</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{stats.failed}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="glass-card p-5">
          <div className="flex items-center gap-2">
            <ClipboardList size={17} className="text-amber-700" />
            <h2 className="font-semibold">Pre-voo de importacao</h2>
          </div>
          <div className="mt-4 space-y-3">
            {checklist.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <Link href="/dashboard/saldos/reconciliacao" className="brand-secondary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold">
            Abrir reconciliacao de saldos
            <ArrowRight size={14} />
          </Link>
        </section>

        <section className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-stone-900/8 p-4">
            <History size={17} className="text-amber-700" />
            <h2 className="font-semibold">Historico recente</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-stone-500">Carregando historico...</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-700">{error}</div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-500">
              Nenhuma importacao registrada em auditoria ainda.
            </div>
          ) : (
            <div className="divide-y divide-stone-900/8">
              {events.map((event) => (
                <article key={event.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{event.summary}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {event.actor_username} - {formatDate(event.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full border border-stone-200 px-2 py-1 text-[10px] font-bold uppercase text-stone-600">
                      {event.action}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
