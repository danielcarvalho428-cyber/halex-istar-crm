'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  DatabaseZap,
  Eye,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';

type ImportPreview = {
  sourceRows: number;
  licitacoes: number;
  items: number;
  representative: string;
  openedFrom: string;
  openedTo: string;
  sourceOpeningMin: string | null;
  sourceOpeningMax: string | null;
  validation: {
    existingRecords: number;
    newRecords: number;
    newItems: number;
    ignoredRows: number;
    missingClientCode: number;
    missingProcess: number;
    missingExpiration: number;
    zeroValueItems: number;
  };
  sample: Array<{
    orgao: string;
    numero_pregao: string;
    numero_processo: string | null;
    data_abertura: string | null;
    data_vencimento: string | null;
    items: number;
    valor_total_ganho: number;
    willImport: boolean;
  }>;
};

type ImportResult = {
  sourceRows: number;
  licitacoes: number;
  items: number;
  skippedExisting: number;
  representative: string;
  openedFrom: string;
  openedTo: string;
  updatedAt: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function todayIsoDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

async function importRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(result?.message || 'Falha ao acessar importador.');
  }
  return result.data as T;
}

export default function HalexPowerBiImportPage() {
  const router = useRouter();
  const [openedFrom, setOpenedFrom] = useState('2024-10-01');
  const [openedTo, setOpenedTo] = useState(todayIsoDate);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    setResult(null);

    try {
      if (!openedFrom || !openedTo || openedFrom > openedTo) {
        throw new Error('Escolha um período válido para a data de abertura.');
      }
      const params = new URLSearchParams({ openedFrom, openedTo });
      const data = await importRequest<ImportPreview>(`/api/import/halex-powerbi?${params}`);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Erro ao ler Power BI.');
    } finally {
      setLoadingPreview(false);
    }
  }, [openedFrom, openedTo]);

  async function runImport() {
    if (!preview) return;
    const confirmed = window.confirm(
      `Adicionar ${preview.validation.newRecords} novo(s) pregão(ões) e ${preview.validation.newItems} item(ns)? ` +
      `${preview.validation.existingRecords} pregão(ões) existente(s) serão ignorados e permanecerão inalterados.`
    );
    if (!confirmed) return;

    setImporting(true);
    setError(null);

    try {
      const data = await importRequest<ImportResult>('/api/import/halex-powerbi', {
        method: 'POST',
        body: JSON.stringify({ openedFrom, openedTo }),
      });
      setResult(data);
      setPreview(null);
      window.setTimeout(() => {
        router.push('/dashboard');
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar dados.');
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPreview();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadPreview]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-hero flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200">
            <DatabaseZap size={14} />
            Power BI Halex Istar
          </div>
          <h1 className="text-3xl font-semibold text-slate-50">Importar Paulo Roberto</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Busca a tabela pública do Power BI e adiciona somente os pregões novos do Paulo Roberto.
            Pregões que já existem no sistema não são alterados.
          </p>
        </div>
        <Link
          href="/dashboard/licitacoes"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-amber-300/30 hover:text-amber-200"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      </div>

      <section className="rounded-xl border-2 border-amber-400/30 bg-amber-300/10 p-5 shadow-[0_0_30px_-20px_rgba(251,191,36,0.8)]">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-amber-200">
            <CalendarDays size={20} />
            <h2 className="text-base font-bold">Escolha o período pela data de abertura</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Apenas pregões cuja data de abertura esteja dentro deste intervalo aparecerão na prévia.
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <label className="rounded-lg border border-white/10 bg-slate-950/35 p-3 text-xs font-semibold text-slate-200">
              Data de abertura inicial
              <div className="relative mt-2">
                <CalendarDays size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-600" />
              <input
                type="date"
                value={openedFrom}
                max={openedTo || todayIsoDate()}
                onClick={(event) => event.currentTarget.showPicker?.()}
                onChange={(event) => {
                  setOpenedFrom(event.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                className="date-filter-input form-input w-full cursor-pointer pl-10 text-base font-bold"
              />
              </div>
            </label>
            <label className="rounded-lg border border-white/10 bg-slate-950/35 p-3 text-xs font-semibold text-slate-200">
              Data de abertura final
              <div className="relative mt-2">
                <CalendarDays size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-600" />
              <input
                type="date"
                value={openedTo}
                min={openedFrom}
                max={todayIsoDate()}
                onClick={(event) => event.currentTarget.showPicker?.()}
                onChange={(event) => {
                  setOpenedTo(event.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                className="date-filter-input form-input w-full cursor-pointer pl-10 text-base font-bold"
              />
              </div>
            </label>
            <p className="text-xs font-medium text-amber-100/75 sm:col-span-2">
              O filtro usa exclusivamente a data de abertura do pregão, não a data de vencimento.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <button
              type="button"
              onClick={loadPreview}
              disabled={loadingPreview || importing || !openedFrom || !openedTo || openedFrom > openedTo}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-amber-300/15 px-5 py-3 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={17} className={loadingPreview ? 'animate-spin' : ''} />
              Aplicar período e atualizar prévia
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={!preview || preview.validation.newRecords === 0 || loadingPreview || importing}
              className="brand-button inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud size={17} />
              {importing ? 'Importando...' : 'Importar para Supabase'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-950/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {loadingPreview && (
        <div className="glass-card flex min-h-[240px] flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-300 border-t-transparent" />
          <p className="text-sm text-slate-400">Lendo dados do Power BI...</p>
        </div>
      )}

      {result && (
        <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <p className="text-sm font-bold text-emerald-200">Importação concluída</p>
          <p className="mt-1 text-sm text-emerald-100/80">
            {result.licitacoes} novo(s) pregão(ões) e {result.items} item(ns) foram adicionados.
            {' '}{result.skippedExisting} pregão(ões) existente(s) foram ignorados sem alterações.
            {' '}Período de abertura: {result.openedFrom.split('-').reverse().join('/')} até {result.openedTo.split('-').reverse().join('/')}.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-black/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-200 hover:text-white"
          >
            Ver no Painel Geral
          </Link>
        </div>
      )}

      {preview && !loadingPreview && (
        <>
          <div className="metric-strip grid grid-cols-1 xl:grid-cols-3">
            <div className="metric-item p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Linhas Power BI</p>
              <p className="mt-1 text-2xl font-black text-slate-100">{preview.sourceRows.toLocaleString('pt-BR')}</p>
            </div>
            <div className="metric-item p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Novos pregões</p>
              <p className="mt-1 text-2xl font-black text-amber-200">{preview.validation.newRecords.toLocaleString('pt-BR')}</p>
            </div>
            <div className="metric-item p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Existentes ignorados</p>
              <p className="mt-1 text-2xl font-black text-emerald-300">{preview.validation.existingRecords.toLocaleString('pt-BR')}</p>
            </div>
          </div>

          <section className="editorial-section px-5 py-5 md:px-6" aria-labelledby="validation-title">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="lumina-kicker">Validação antes de importar</p>
                <h2 id="validation-title" className="mt-2 text-lg font-semibold text-stone-950">Integridade da atualização</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Registros existentes serão ignorados por completo; somente novos pregões serão adicionados.
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Período solicitado: {preview.openedFrom.split('-').reverse().join('/')} até{' '}
                  {preview.openedTo.split('-').reverse().join('/')} · Datas encontradas:{' '}
                  {preview.sourceOpeningMin
                    ? `${preview.sourceOpeningMin.split('-').reverse().join('/')} até ${preview.sourceOpeningMax?.split('-').reverse().join('/')}`
                    : 'nenhuma'}
                </p>
              </div>
              <div className={`inline-flex items-center gap-2 text-xs font-bold ${
                preview.validation.ignoredRows || preview.validation.zeroValueItems ? 'text-amber-800' : 'text-emerald-700'
              }`}>
                {preview.validation.ignoredRows || preview.validation.zeroValueItems
                  ? <AlertTriangle size={16} />
                  : <CheckCircle2 size={16} />}
                {preview.validation.ignoredRows || preview.validation.zeroValueItems
                  ? 'Atenção aos avisos'
                  : 'Pronto para importar'}
              </div>
            </div>
            <div className="mt-5 grid border-y border-stone-900/10 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Novas licitações', preview.validation.newRecords, 'success'],
                ['Licitações existentes ignoradas', preview.validation.existingRecords, 'success'],
                ['Fora das carteiras mapeadas', preview.validation.ignoredRows, preview.validation.ignoredRows ? 'warning' : 'success'],
                ['Itens sem valor', preview.validation.zeroValueItems, preview.validation.zeroValueItems ? 'warning' : 'success'],
                ['Sem código do cliente', preview.validation.missingClientCode, preview.validation.missingClientCode ? 'neutral' : 'success'],
                ['Sem processo', preview.validation.missingProcess, preview.validation.missingProcess ? 'neutral' : 'success'],
                ['Sem vencimento', preview.validation.missingExpiration, preview.validation.missingExpiration ? 'warning' : 'success'],
              ].map(([label, value, tone], index) => (
                <div
                  key={String(label)}
                  className={`flex items-center justify-between gap-3 py-3 sm:px-4 ${
                    index % 2 ? 'sm:border-l sm:border-stone-900/10' : ''
                  } ${index > 1 ? 'border-t border-stone-900/10 xl:border-t-0' : ''}`}
                >
                  <div className="flex items-center gap-2 text-xs text-stone-600">
                    {tone === 'warning'
                      ? <AlertTriangle size={14} className="text-amber-700" />
                      : tone === 'success'
                        ? <CheckCircle2 size={14} className="text-emerald-700" />
                        : <CircleDot size={14} className="text-stone-400" />}
                    {String(label)}
                  </div>
                  <strong className="text-sm text-stone-900">{Number(value).toLocaleString('pt-BR')}</strong>
                </div>
              ))}
            </div>
            {preview.validation.ignoredRows > 0 && (
              <p className="mt-3 border-l-2 border-amber-500 pl-3 text-xs leading-5 text-stone-600">
                {preview.validation.ignoredRows} linha(s) possuem UF sem carteira configurada para Paulo Roberto e não serão importadas.
              </p>
            )}
          </section>

          <div className="glass-card overflow-hidden border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/40 px-4 py-3 text-sm font-bold text-slate-200">
              <Eye size={16} className="text-amber-300" />
              Amostra do período selecionado
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[880px] w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="name-cell px-4 py-3">Órgão</th>
                    <th className="px-4 py-3">Pregão</th>
                    <th className="px-4 py-3">Data de abertura</th>
                    <th className="px-4 py-3">Processo</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="money-cell px-4 py-3">Itens</th>
                    <th className="money-cell px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {preview.sample.map((item) => (
                    <tr key={`${item.orgao}-${item.numero_pregao}-${item.numero_processo}`} className="hover:bg-slate-900/30">
                      <td className="name-cell readable-name px-4 py-3 font-semibold leading-relaxed text-slate-200">{item.orgao}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{item.numero_pregao}</td>
                      <td className="px-4 py-3 font-mono text-amber-200">
                        {item.data_abertura ? item.data_abertura.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{item.numero_processo || '-'}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{item.data_vencimento || '-'}</td>
                      <td className="money-cell px-4 py-3 font-mono text-slate-300">{item.items}</td>
                      <td className="money-cell px-4 py-3 font-mono font-bold text-emerald-300">
                        {formatCurrency(item.valor_total_ganho)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          item.willImport
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}>
                          {item.willImport ? 'Adicionar' : 'Ignorar existente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
