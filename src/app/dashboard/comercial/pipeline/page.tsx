'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleDollarSign, Plus, Target, X } from 'lucide-react';
import CommercialNav from '@/components/CommercialNav';
import { collectCommercialRecords } from '@/lib/commercial-contacts';
import { db } from '@/lib/db';
import { buildPurchaseTrends, type PurchaseTrend } from '@/lib/purchase-trends';
import type { CommercialOpportunity, CommercialPipelineStage, Empenho, Licitacao } from '@/types';
import { useSessionRole } from '@/lib/useSessionRole';

const stages: { key: CommercialPipelineStage; label: string; probability: number }[] = [
  { key: 'identificado', label: 'Identificado', probability: 10 },
  { key: 'contato', label: 'Contato', probability: 25 },
  { key: 'interessado', label: 'Interessado', probability: 45 },
  { key: 'proposta', label: 'Proposta', probability: 65 },
  { key: 'negociacao', label: 'Negociação', probability: 80 },
  { key: 'recuperado', label: 'Recuperado', probability: 100 },
  { key: 'perdido', label: 'Perdido', probability: 0 },
];

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function PipelinePage() {
  const { isAdmin } = useSessionRole();
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PurchaseTrend | null>(null);
  const [title, setTitle] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [stage, setStage] = useState<CommercialPipelineStage>('identificado');
  const [probability, setProbability] = useState(10);
  const [owner, setOwner] = useState('');
  const [expectedCloseAt, setExpectedCloseAt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await db.getAppData();
      setLicitacoes(data.licitacoes);
      setEmpenhos(data.empenhos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar pipeline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const trends = useMemo(() => buildPurchaseTrends(licitacoes, empenhos), [licitacoes, empenhos]);
  const trendByKey = useMemo(() => new Map(trends.map((item) => [item.clientKey, item])), [trends]);
  const opportunities = useMemo(() => collectCommercialRecords(licitacoes).opportunities, [licitacoes]);
  const forecast = opportunities
    .filter((item) => item.stage !== 'perdido')
    .reduce((sum, item) => sum + item.estimated_value * item.probability / 100, 0);
  const recovered = opportunities.filter((item) => item.stage === 'recuperado').reduce((sum, item) => sum + item.estimated_value, 0);

  const openNew = (trend?: PurchaseTrend) => {
    const candidate = trend || trends[0] || null;
    setSelected(candidate);
    setTitle(candidate ? `Recuperação comercial · ${candidate.client}` : '');
    setEstimatedValue('');
    setStage('identificado');
    setProbability(10);
    setOwner('');
    setExpectedCloseAt(candidate?.predictedDate || '');
    setNotes('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await db.saveCommercialOpportunity({
        licitacaoId: selected.licitacaoId,
        clientKey: selected.clientKey,
        title,
        stage,
        estimatedValue: Number(estimatedValue),
        probability,
        owner,
        expectedCloseAt,
        notes,
      });
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar oportunidade.');
    } finally {
      setSaving(false);
    }
  };

  const move = async (opportunity: CommercialOpportunity, nextStage: CommercialPipelineStage) => {
    const trend = trendByKey.get(opportunity.client_key);
    if (!trend) return;
    const defaultProbability = stages.find((item) => item.key === nextStage)?.probability ?? opportunity.probability;
    await db.saveCommercialOpportunity({
      licitacaoId: opportunity.licitacao_id,
      clientKey: opportunity.client_key,
      id: opportunity.id,
      title: opportunity.title,
      stage: nextStage,
      estimatedValue: opportunity.estimated_value,
      probability: defaultProbability,
      owner: opportunity.owner || '',
      expectedCloseAt: opportunity.expected_close_at || '',
      notes: opportunity.notes || '',
      createdAt: opportunity.created_at,
      createdBy: opportunity.created_by,
    });
    await load();
  };

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Carregando pipeline...</div>;

  return (
    <div className="space-y-6">
      <header className="page-hero flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="lumina-kicker">CRM Comercial</p><h1 className="mt-2 text-3xl font-semibold text-stone-950">Pipeline de recuperação</h1><p className="mt-2 text-sm text-stone-500">Acompanhe valor, probabilidade, responsável e avanço de cada oportunidade.</p></div>
        {isAdmin && <button type="button" onClick={() => openNew()} className="brand-button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"><Plus size={16} />Nova oportunidade</button>}
      </header>
      <CommercialNav />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Pipeline aberto</p><p className="mt-2 text-2xl font-semibold">{money(opportunities.filter((item) => !['recuperado', 'perdido'].includes(item.stage)).reduce((sum, item) => sum + item.estimated_value, 0))}</p></div>
        <div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Previsão ponderada</p><p className="mt-2 text-2xl font-semibold text-amber-800">{money(forecast)}</p></div>
        <div className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">Receita recuperada</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{money(recovered)}</p></div>
      </section>
      {opportunities.length === 0 ? (
        <section className="glass-card p-8 text-center"><Target className="mx-auto text-amber-700" /><h2 className="mt-3 font-semibold text-stone-900">Pipeline vazio</h2><p className="mt-1 text-sm text-stone-500">Comece pelos clientes que já aparecem na tendência de compra.</p><Link href="/dashboard/comercial/tendencias" className="brand-secondary mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-bold">Ver tendências</Link></section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-4">
          {stages.map((column) => {
            const records = opportunities.filter((item) => item.stage === column.key);
            return (
              <div key={column.key} className="glass-card min-w-0 p-3">
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-stone-800">{column.label}</h2><span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold">{records.length}</span></div>
                <div className="space-y-3">
                  {records.map((item) => {
                    const trend = trendByKey.get(item.client_key);
                    const index = stages.findIndex((entry) => entry.key === item.stage);
                    const next = stages[index + 1];
                    return (
                      <article key={item.id} className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
                        <Link href={`/dashboard/comercial/clientes/${encodeURIComponent(item.client_key)}`} className="text-xs font-bold text-stone-900 hover:text-amber-800">{trend?.client || item.title}</Link>
                        <p className="mt-1 text-[11px] text-stone-500">{item.title}</p>
                        <div className="mt-3 flex items-center justify-between"><strong className="text-sm text-amber-800">{money(item.estimated_value)}</strong><span className="text-[10px] font-bold text-stone-500">{item.probability}%</span></div>
                        {item.owner && <p className="mt-2 text-[10px] text-stone-500">Responsável: {item.owner}</p>}
                        {isAdmin && next && item.stage !== 'perdido' && <button type="button" onClick={() => void move(item, next.key)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-900">Mover para {next.label}<ArrowRight size={11} /></button>}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#fffaf0] p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><p className="lumina-kicker">Nova oportunidade</p><h2 className="mt-2 text-xl font-semibold">{selected.client}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-stone-200 bg-white p-2"><X size={17} /></button></div>
            <label className="mt-5 block text-xs font-bold text-stone-600">Cliente<select value={selected.clientKey} onChange={(event) => setSelected(trends.find((item) => item.clientKey === event.target.value) || null)} className="form-input mt-2 w-full">{trends.map((item) => <option key={item.clientKey} value={item.clientKey}>{item.client}</option>)}</select></label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-stone-600 sm:col-span-2">Título<input required value={title} onChange={(e) => setTitle(e.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-bold text-stone-600">Valor estimado<input required min="0" step="0.01" type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-bold text-stone-600">Responsável<input value={owner} onChange={(e) => setOwner(e.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-bold text-stone-600">Etapa<select value={stage} onChange={(e) => { const value = e.target.value as CommercialPipelineStage; setStage(value); setProbability(stages.find((item) => item.key === value)?.probability || 0); }} className="form-input mt-2 w-full">{stages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
              <label className="text-xs font-bold text-stone-600">Probabilidade<input min="0" max="100" type="number" value={probability} onChange={(e) => setProbability(Number(e.target.value))} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-bold text-stone-600 sm:col-span-2">Previsão de fechamento<input type="date" value={expectedCloseAt} onChange={(e) => setExpectedCloseAt(e.target.value)} className="form-input mt-2 w-full" /></label>
              <label className="text-xs font-bold text-stone-600 sm:col-span-2">Observações<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input mt-2 w-full" /></label>
            </div>
            <button disabled={saving} className="brand-button mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold"><CircleDollarSign size={17} />{saving ? 'Salvando...' : 'Adicionar ao pipeline'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
