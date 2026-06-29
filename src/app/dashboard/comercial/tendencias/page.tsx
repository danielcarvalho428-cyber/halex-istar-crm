'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Radar,
  Search,
  Sparkles,
  UserRoundCheck,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db } from '@/lib/db';
import { buildPurchaseTrends, type PurchaseTrend, type PurchaseTrendPriority } from '@/lib/purchase-trends';
import { useSessionRole } from '@/lib/useSessionRole';
import type { CommercialContactOutcome, Empenho, Licitacao } from '@/types';
import CommercialNav from '@/components/CommercialNav';

const priorityLabels: Record<PurchaseTrendPriority, string> = {
  atrasado: 'Contato atrasado',
  agora: 'Ligar agora',
  em_breve: 'Próximos 45 dias',
  acompanhar: 'Acompanhar',
  sem_previsao: 'Sem previsão',
};

const priorityClasses: Record<PurchaseTrendPriority, string> = {
  atrasado: 'border-red-200 bg-red-50 text-red-700',
  agora: 'border-amber-300 bg-amber-100 text-amber-900',
  em_breve: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  acompanhar: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sem_previsao: 'border-stone-200 bg-stone-50 text-stone-600',
};

const outcomeLabels: Record<CommercialContactOutcome, string> = {
  contato_realizado: 'Contato realizado',
  interessado: 'Cliente interessado',
  sem_resposta: 'Sem resposta',
  retornar: 'Pediu retorno',
  sem_interesse: 'Sem interesse agora',
};

function formatDate(value?: string | null) {
  if (!value) return 'Não estimada';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

type PriorityFilter = 'todos' | 'prioritarios' | PurchaseTrendPriority;

export default function PurchaseTrendsPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<PriorityFilter>('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<PurchaseTrend | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contactedAt, setContactedAt] = useState(today());
  const [outcome, setOutcome] = useState<CommercialContactOutcome>('contato_realizado');
  const [notes, setNotes] = useState('');
  const [nextContactAt, setNextContactAt] = useState('');
  const [saving, setSaving] = useState(false);
  const { isAdmin } = useSessionRole();

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await db.getAppData();
      setLicitacoes(data.licitacoes);
      setEmpenhos(data.empenhos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível calcular as tendências.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const trends = useMemo(() => buildPurchaseTrends(licitacoes, empenhos), [empenhos, licitacoes]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return trends.filter((trend) => {
      if (priority === 'prioritarios' && trend.priority !== 'atrasado' && trend.priority !== 'agora') return false;
      if (priority !== 'todos' && priority !== 'prioritarios' && trend.priority !== priority) return false;
      if (!normalized) return true;
      return [
        trend.client,
        trend.clientCode,
        trend.region,
        trend.state,
        trend.contactName,
        trend.phone,
        trend.email,
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalized);
    });
  }, [priority, query, trends]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, pageCount);
  const paginated = useMemo(
    () => filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, filtered]
  );

  const summary = useMemo(() => ({
    urgent: trends.filter((trend) => trend.priority === 'atrasado' || trend.priority === 'agora').length,
    soon: trends.filter((trend) => trend.priority === 'em_breve').length,
    contacted: trends.filter((trend) => trend.lastContact?.contacted_at === today()).length,
    predictable: trends.filter((trend) => trend.confidence !== 'insuficiente').length,
  }), [trends]);
  const summaryCards: { label: string; value: number; icon: LucideIcon; filter?: PriorityFilter }[] = [
    { label: 'Ligar agora', value: summary.urgent, icon: Phone, filter: 'prioritarios' },
    { label: 'Em breve', value: summary.soon, icon: CalendarClock, filter: 'em_breve' },
    { label: 'Contatados hoje', value: summary.contacted, icon: UserRoundCheck },
    { label: 'Com previsão', value: summary.predictable, icon: Radar },
  ];

  const openContact = (trend: PurchaseTrend) => {
    setSelected(trend);
    setContactedAt(today());
    setOutcome('contato_realizado');
    setNotes('');
    setNextContactAt('');
  };

  const saveContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await db.saveCommercialContact({
        licitacaoId: selected.licitacaoId,
        clientKey: selected.clientKey,
        contactedAt,
        outcome,
        notes,
        nextContactAt,
      });
      setSelected(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o contato.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-stone-500">Analisando histórico de compras...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="page-hero flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="lumina-kicker">Inteligência comercial</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950 md:text-4xl">Tendência de compra</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
            Estima a próxima movimentação pelo intervalo histórico de pregões e empenhos. A confiança indica quanto histórico sustenta a previsão.
          </p>
        </div>
        <Link href="/dashboard/licitacoes/compare" className="brand-secondary inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
          <Sparkles size={16} />
          Comparativo comercial
        </Link>
      </header>
      <CommercialNav />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}

      <section className="metric-strip grid grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, filter }) => {
          const content = (
            <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
              <Icon size={16} className="text-amber-700" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
            {filter && <p className="mt-2 text-[10px] font-bold text-amber-800">Filtrar lista →</p>}
            </>
          );
          return filter ? (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPriority(filter);
                setCurrentPage(1);
              }}
              className={`metric-item p-4 text-left transition-colors hover:bg-amber-50/50 ${
                priority === filter ? 'bg-amber-100/50' : ''
              }`}
            >
              {content}
            </button>
          ) : (
            <div key={label} className="metric-item p-4">{content}</div>
          );
        })}
      </section>

      <section className="glass-panel grid gap-3 p-4 md:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input w-full pl-9" placeholder="Buscar cliente, código, carteira ou contato..." />
        </label>
        <select
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value as PriorityFilter);
            setCurrentPage(1);
          }}
          className="form-input"
        >
          <option value="todos">Todas as prioridades</option>
          <option value="prioritarios">Contato prioritário</option>
          {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-stone-900/8 px-5 py-4">
          <h2 className="font-semibold text-stone-950">Carteira priorizada</h2>
          <p className="mt-1 text-xs text-stone-500">{filtered.length} cliente(s) nos filtros atuais.</p>
        </div>
        <div className="divide-y divide-stone-900/8">
          {paginated.map((trend) => (
            <article key={trend.clientKey} className="p-4 md:p-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(125px,0.7fr))_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">{trend.client}</h3>
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${priorityClasses[trend.priority]}`}>
                      {priorityLabels[trend.priority]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {[trend.clientCode && `Código ${trend.clientCode}`, trend.region, trend.state].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Próxima compra</p>
                  <p className="mt-1 text-sm font-bold text-amber-800">{formatDate(trend.predictedDate)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Ciclo estimado</p>
                  <p className="mt-1 text-sm font-semibold text-stone-800">{trend.averageIntervalDays ? `${trend.averageIntervalDays} dias` : 'Sem dados'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Confiança</p>
                  <p className="mt-1 text-sm font-semibold capitalize text-stone-800">{trend.confidence} · {trend.events} evento(s)</p>
                </div>
                  <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/comercial/clientes/${encodeURIComponent(trend.clientKey)}`}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700"
                  >
                    Perfil
                  </Link>
                  {isAdmin && (
                    <button type="button" onClick={() => openContact(trend)} className="brand-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold">
                      <Phone size={14} />
                      Registrar contato
                    </button>
                  )}
                  <button type="button" aria-label="Mostrar histórico" onClick={() => setExpanded(expanded === trend.clientKey ? null : trend.clientKey)} className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600">
                    {expanded === trend.clientKey ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {expanded === trend.clientKey && (
                <div className="mt-4 grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 lg:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Perfil e contato</p>
                    <div className="mt-3 space-y-2 text-sm text-stone-700">
                      <p>Última compra/evento: <strong>{formatDate(trend.lastPurchaseDate)}</strong></p>
                      <p>Base da previsão: <strong>{trend.source === 'empenhos' ? 'pedidos/empenhos' : trend.source === 'pregoes' ? 'pregões ganhos' : 'histórico insuficiente'}</strong></p>
                      {trend.contactName && <p>Contato: <strong>{trend.contactName}</strong></p>}
                      {trend.phone && <a className="flex items-center gap-2 font-semibold text-amber-800" href={`tel:${trend.phone}`}><Phone size={14} />{trend.phone}</a>}
                      {trend.email && <a className="flex items-center gap-2 font-semibold text-amber-800" href={`mailto:${trend.email}`}><Mail size={14} />{trend.email}</a>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Últimos contatos</p>
                    <div className="mt-3 space-y-2">
                      {trend.contacts.length === 0 ? (
                        <p className="text-sm text-stone-500">Nenhum contato registrado.</p>
                      ) : trend.contacts.slice(0, 4).map((contact) => (
                        <div key={contact.id} className="rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-600">
                          <div className="flex items-center justify-between gap-3">
                            <strong className="text-stone-800">{outcomeLabels[contact.outcome]}</strong>
                            <span>{formatDate(contact.contacted_at)}</span>
                          </div>
                          {contact.notes && <p className="mt-1">{contact.notes}</p>}
                          {contact.next_contact_at && <p className="mt-1 font-semibold text-amber-800">Retornar: {formatDate(contact.next_contact_at)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
        {filtered.length > pageSize && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-900/8 px-5 py-4 text-xs text-stone-500 sm:flex-row">
            <p>Exibindo {(effectivePage - 1) * pageSize + 1}–{Math.min(effectivePage * pageSize, filtered.length)} de {filtered.length}</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={effectivePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:opacity-40">Anterior</button>
              <span className="px-2 font-semibold text-stone-700">{effectivePage} / {pageCount}</span>
              <button type="button" disabled={effectivePage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={saveContact} className="w-full max-w-xl rounded-2xl border border-stone-200 bg-[#fffaf0] p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="lumina-kicker">Acompanhamento comercial</p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">{selected.client}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600"><X size={18} /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-stone-600">Data do contato<input type="date" required value={contactedAt} onChange={(event) => setContactedAt(event.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-semibold text-stone-600">Resultado<select value={outcome} onChange={(event) => setOutcome(event.target.value as CommercialContactOutcome)} className="form-input mt-2 w-full">{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-semibold text-stone-600 sm:col-span-2">Próximo contato<input type="date" value={nextContactAt} onChange={(event) => setNextContactAt(event.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-semibold text-stone-600 sm:col-span-2">Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={2000} className="form-input mt-2 w-full resize-y" placeholder="O que o cliente informou? Qual produto ou previsão foi discutida?" /></label>
            </div>
            <button disabled={saving} className="brand-button mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold disabled:opacity-60">
              <CheckCircle2 size={17} />
              {saving ? 'Salvando...' : 'Salvar contato'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
