'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, Clock3, Plus, X } from 'lucide-react';
import CommercialNav from '@/components/CommercialNav';
import { collectCommercialRecords } from '@/lib/commercial-contacts';
import { db } from '@/lib/db';
import { buildPurchaseTrends, type PurchaseTrend } from '@/lib/purchase-trends';
import type { CommercialTask, CommercialTaskType, Empenho, Licitacao } from '@/types';
import { useSessionRole } from '@/lib/useSessionRole';

const typeLabels: Record<CommercialTaskType, string> = {
  ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', proposta: 'Proposta', outro: 'Outro',
};

function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value: string) { return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`)); }

export default function AgendaPage() {
  const { isAdmin } = useSessionRole();
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchaseTrend | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CommercialTaskType>('ligacao');
  const [dueAt, setDueAt] = useState(today());
  const [owner, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { const data = await db.getAppData(); setLicitacoes(data.licitacoes); setEmpenhos(data.empenhos); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar agenda.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => clearTimeout(id); }, []);

  const trends = useMemo(() => buildPurchaseTrends(licitacoes, empenhos), [licitacoes, empenhos]);
  const trendByKey = useMemo(() => new Map(trends.map((item) => [item.clientKey, item])), [trends]);
  const tasks = useMemo(() => collectCommercialRecords(licitacoes).tasks, [licitacoes]);
  const pending = tasks.filter((item) => item.status === 'pendente').sort((a, b) => a.due_at.localeCompare(b.due_at));
  const overdue = pending.filter((item) => item.due_at < today());
  const dueToday = pending.filter((item) => item.due_at === today());
  const upcoming = pending.filter((item) => item.due_at > today());
  const suggestions = trends.filter((item) => ['atrasado', 'agora', 'em_breve'].includes(item.priority) && !pending.some((task) => task.client_key === item.clientKey)).slice(0, 12);

  const open = (trend?: PurchaseTrend) => {
    const client = trend || trends[0] || null;
    setSelected(client); setTitle(client ? `Contato comercial · ${client.client}` : ''); setType('ligacao');
    setDueAt(client?.predictedDate && client.predictedDate > today() ? client.predictedDate : today()); setOwner(''); setNotes('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    try {
      await db.saveCommercialTask({ licitacaoId: selected.licitacaoId, clientKey: selected.clientKey, title, type, dueAt, status: 'pendente', owner, notes });
      setSelected(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao salvar tarefa.'); }
  };
  const complete = async (task: CommercialTask) => {
    await db.saveCommercialTask({
      licitacaoId: task.licitacao_id, clientKey: task.client_key, id: task.id, title: task.title, type: task.type,
      dueAt: task.due_at, status: 'concluida', owner: task.owner || '', notes: task.notes || '',
      createdAt: task.created_at, createdBy: task.created_by, completedAt: new Date().toISOString(),
    });
    await load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Montando agenda...</div>;
  const section = (label: string, records: CommercialTask[], tone: string) => (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-900/8 px-4 py-3"><h2 className={`text-sm font-bold ${tone}`}>{label}</h2><span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold">{records.length}</span></div>
      <div className="divide-y divide-stone-900/8">
        {records.length === 0 ? <p className="p-4 text-sm text-stone-500">Nenhuma tarefa.</p> : records.map((task) => {
          const trend = trendByKey.get(task.client_key);
          return <article key={task.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-stone-900">{task.title}</strong><span className="rounded bg-stone-100 px-2 py-0.5 text-[9px] font-bold">{typeLabels[task.type]}</span></div><Link href={`/dashboard/comercial/clientes/${encodeURIComponent(task.client_key)}`} className="mt-1 block text-xs text-amber-800">{trend?.client || task.client_key}</Link><p className="mt-1 text-[11px] text-stone-500">{formatDate(task.due_at)}{task.owner ? ` · ${task.owner}` : ''}</p></div>
            {isAdmin && <button type="button" onClick={() => void complete(task)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Check size={14} />Concluir</button>}
          </article>;
        })}
      </div>
    </section>
  );

  return <div className="space-y-6">
    <header className="page-hero flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="lumina-kicker">CRM Comercial</p><h1 className="mt-2 text-3xl font-semibold">Agenda e lembretes</h1><p className="mt-2 text-sm text-stone-500">Follow-ups vencidos, contatos de hoje e próximas ações.</p></div>{isAdmin && <button onClick={() => open()} className="brand-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"><Plus size={16} />Nova tarefa</button>}</header>
    <CommercialNav />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <section className="grid grid-cols-3 gap-3"><div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Atrasadas</p><p className="mt-2 text-2xl font-semibold text-red-700">{overdue.length}</p></div><div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Hoje</p><p className="mt-2 text-2xl font-semibold text-amber-800">{dueToday.length}</p></div><div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Próximas</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{upcoming.length}</p></div></section>
    {section('Atrasadas', overdue, 'text-red-700')}{section('Hoje', dueToday, 'text-amber-800')}{section('Próximas ações', upcoming.slice(0, 20), 'text-stone-800')}
    {isAdmin && suggestions.length > 0 && <section className="glass-card p-5"><div className="flex items-center gap-2"><Clock3 size={17} className="text-amber-700" /><h2 className="font-semibold">Sugestões automáticas</h2></div><p className="mt-1 text-xs text-stone-500">Clientes prioritários ainda sem tarefa agendada.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{suggestions.map((trend) => <button key={trend.clientKey} onClick={() => open(trend)} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3 text-left"><div><strong className="text-sm">{trend.client}</strong><p className="mt-1 text-[11px] text-stone-500">Previsão: {trend.predictedDate ? formatDate(trend.predictedDate) : 'sem data'}</p></div><Plus size={15} className="text-amber-700" /></button>)}</div></section>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4"><form onSubmit={save} className="w-full max-w-xl rounded-2xl bg-[#fffaf0] p-6 shadow-2xl"><div className="flex justify-between"><div><p className="lumina-kicker">Nova tarefa</p><h2 className="mt-2 text-xl font-semibold">{selected.client}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-stone-200 bg-white p-2"><X size={17} /></button></div><label className="mt-5 block text-xs font-bold">Cliente<select value={selected.clientKey} onChange={(e) => setSelected(trends.find((item) => item.clientKey === e.target.value) || null)} className="form-input mt-2 w-full">{trends.map((item) => <option key={item.clientKey} value={item.clientKey}>{item.client}</option>)}</select></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold sm:col-span-2">Título<input required value={title} onChange={(e) => setTitle(e.target.value)} className="form-input mt-2 w-full" /></label><label className="text-xs font-bold">Tipo<select value={type} onChange={(e) => setType(e.target.value as CommercialTaskType)} className="form-input mt-2 w-full">{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold">Prazo<input required type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="form-input mt-2 w-full" /></label><label className="text-xs font-bold sm:col-span-2">Responsável<input value={owner} onChange={(e) => setOwner(e.target.value)} className="form-input mt-2 w-full" /></label><label className="text-xs font-bold sm:col-span-2">Observações<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input mt-2 w-full" /></label></div><button className="brand-button mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"><CalendarDays size={16} />Agendar tarefa</button></form></div>}
  </div>;
}
