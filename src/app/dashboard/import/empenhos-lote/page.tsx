'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  UploadCloud,
} from 'lucide-react';
import { db, type AppDataBundle } from '@/lib/db';
import { formatAppDate } from '@/lib/date';
import {
  matchHalexInvoices,
  parseHalexInvoiceMatrix,
  type BulkEmpenhoImportEntry,
  type BulkEmpenhoImportResult,
  type HalexInvoiceMatch,
  type HalexMatrixRow,
} from '@/lib/halex-bulk-empenho';

const PAGE_SIZE = 50;
const IMPORT_BATCH_SIZE = 75;

type Filter = 'all' | 'ready' | 'review' | 'duplicate' | 'unmatched';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function confidenceLabel(match: HalexInvoiceMatch) {
  if (match.duplicateEmpenhoId) return 'NF já importada';
  if (match.selectedLicitacaoId && match.confidence === 'ambiguous') return 'Escolha manual';
  if (match.confidence === 'high') return 'Alta confiança';
  if (match.confidence === 'medium') return 'Confiança média';
  if (match.confidence === 'ambiguous') return 'Revisão obrigatória';
  return 'Sem correspondência';
}

function confidenceClasses(match: HalexInvoiceMatch) {
  if (match.duplicateEmpenhoId) return 'border-slate-700 bg-slate-900 text-slate-400';
  if (match.selectedLicitacaoId && match.confidence === 'ambiguous') {
    return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';
  }
  if (match.confidence === 'high') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (match.confidence === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-red-500/30 bg-red-500/10 text-red-200';
}

export default function BulkEmpenhoImportPage() {
  const [appData, setAppData] = useState<AppDataBundle | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [matches, setMatches] = useState<HalexInvoiceMatch[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<BulkEmpenhoImportResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    db.getAppData()
      .then(setAppData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os pregões.'))
      .finally(() => setLoadingData(false));
  }, []);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !appData) return;

    setParsing(true);
    setError('');
    setResult(null);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const invoices = workbook.SheetNames.flatMap((sheetName) => {
        const matrix = XLSX.utils.sheet_to_json<HalexMatrixRow>(
          workbook.Sheets[sheetName],
          { header: 1, defval: '', raw: false }
        );
        return parseHalexInvoiceMatrix(matrix);
      });

      if (invoices.length === 0) {
        throw new Error('Nenhuma seção de NF no formato Halex foi encontrada no arquivo.');
      }

      setMatches(matchHalexInvoices(
        invoices,
        appData.licitacoes,
        appData.itens,
        appData.empenhos
      ));
      setFilter('all');
      setSearch('');
      setPage(1);
    } catch (err) {
      setMatches([]);
      setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
    } finally {
      setParsing(false);
    }
  }

  function selectLicitacao(index: number, licitacaoId: string) {
    setMatches((current) => current.map((match, matchIndex) => (
      matchIndex === index ? { ...match, selectedLicitacaoId: licitacaoId || null } : match
    )));
  }

  const indexedMatches = useMemo(() => matches.map((match, index) => ({ match, index })), [matches]);
  const stats = useMemo(() => ({
    invoices: matches.length,
    itemLines: matches.reduce((sum, match) => sum + match.invoice.items.length, 0),
    ready: matches.filter(
      (match) => match.selectedLicitacaoId && match.invoice.dataEmpenho && !match.duplicateEmpenhoId
    ).length,
    review: matches.filter(
      (match) => !match.duplicateEmpenhoId
        && match.candidates.length > 0
        && (!match.selectedLicitacaoId || !match.invoice.dataEmpenho)
    ).length,
    unmatched: matches.filter((match) => !match.duplicateEmpenhoId && match.candidates.length === 0).length,
    duplicates: matches.filter((match) => match.duplicateEmpenhoId).length,
  }), [matches]);

  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase();
    return indexedMatches.filter(({ match }) => {
      const passesFilter = filter === 'all'
        || (
          filter === 'ready'
          && !!match.selectedLicitacaoId
          && !!match.invoice.dataEmpenho
          && !match.duplicateEmpenhoId
        )
        || (
          filter === 'review'
          && !match.duplicateEmpenhoId
          && match.candidates.length > 0
          && (!match.selectedLicitacaoId || !match.invoice.dataEmpenho)
        )
        || (filter === 'duplicate' && !!match.duplicateEmpenhoId)
        || (filter === 'unmatched' && !match.duplicateEmpenhoId && match.candidates.length === 0);
      if (!passesFilter) return false;
      if (!needle) return true;
      return [
        match.invoice.nf,
        match.invoice.codigoCliente,
        match.invoice.nomeCliente,
        ...match.invoice.items.map((item) => `${item.codigoProduto} ${item.descricao}`),
      ].join(' ').toUpperCase().includes(needle);
    });
  }, [filter, indexedMatches, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function runImport() {
    const entries = matches.flatMap((match): BulkEmpenhoImportEntry[] => {
      if (!match.selectedLicitacaoId || match.duplicateEmpenhoId || !match.invoice.dataEmpenho) return [];
      const candidate = match.candidates.find(
        (item) => item.licitacaoId === match.selectedLicitacaoId
      );
      if (!candidate) return [];

      return [{
        key: match.invoice.key,
        licitacaoId: candidate.licitacaoId,
        codigoCliente: match.invoice.codigoCliente,
        numeroEmpenho: match.invoice.numeroEmpenho,
        dataEmpenho: match.invoice.dataEmpenho,
        dataFaturamento: match.invoice.dataFaturamento,
        ordemVenda: match.invoice.ordemVenda,
        orgao: candidate.orgao,
        items: candidate.items,
      }];
    });

    if (entries.length === 0) {
      setError('Nenhuma NF está pronta para importar.');
      return;
    }
    if (!window.confirm(`Importar ${entries.length} NF(s) mapeadas para seus respectivos pregões?`)) return;

    setImporting(true);
    setError('');
    setResult(null);
    setProgress({ completed: 0, total: entries.length });
    const combined: BulkEmpenhoImportResult = { imported: [], duplicates: [], failed: [] };

    try {
      for (const batch of chunk(entries, IMPORT_BATCH_SIZE)) {
        const batchResult = await db.saveBulkEmpenhos(batch);
        combined.imported.push(...batchResult.imported);
        combined.duplicates.push(...batchResult.duplicates);
        combined.failed.push(...batchResult.failed);
        setProgress((current) => ({
          ...current,
          completed: Math.min(current.total, current.completed + batch.length),
        }));
      }

      const completedKeys = new Set([...combined.imported, ...combined.duplicates]);
      setMatches((current) => current.map((match) => (
        completedKeys.has(match.invoice.key)
          ? { ...match, duplicateEmpenhoId: match.duplicateEmpenhoId || 'imported-now' }
          : match
      )));
      setResult(combined);
      setFilter(combined.failed.length > 0 ? 'ready' : 'all');
      setPage(1);
    } catch (err) {
      if (combined.imported.length > 0 || combined.duplicates.length > 0) {
        const completedKeys = new Set([...combined.imported, ...combined.duplicates]);
        setMatches((current) => current.map((match) => (
          completedKeys.has(match.invoice.key)
            ? { ...match, duplicateEmpenhoId: match.duplicateEmpenhoId || 'imported-now' }
            : match
        )));
        setResult(combined);
      }
      setError(err instanceof Error ? err.message : 'A importação em lote falhou.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      <div className="page-hero flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-200">
            <FileSpreadsheet size={14} />
            Empenhos em lote
          </div>
          <h1 className="text-3xl font-semibold text-slate-50">Importar relatório Halex completo</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Envie um único Excel com milhares de linhas. O sistema separa as NFs e encontra o pregão por cliente,
            produto, preço e data.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      </div>

      <div className="glass-panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-200">
            {fileName || 'Selecione o relatório detalhado em Excel'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Formatos aceitos: XLSX e XLS. Arquivos com aproximadamente 8.000 linhas são processados em lotes.
          </p>
        </div>
        <label className={`brand-button inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
          loadingData || parsing || importing ? 'pointer-events-none opacity-50' : ''
        }`}>
          {parsing ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {parsing ? 'Lendo arquivo...' : 'Selecionar Excel'}
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={loadingData || parsing || importing}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/25 bg-red-950/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <strong>Importação concluída:</strong> {result.imported.length} NF(s) importadas,{' '}
          {result.duplicates.length} duplicada(s) ignoradas e {result.failed.length} com erro.
          {result.failed.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-200">
              {result.failed.slice(0, 10).map((failure, index) => (
                <li key={`${failure.key}-${index}`}>{failure.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {matches.length > 0 && (
        <>
          <div className="metric-strip grid grid-cols-2 xl:grid-cols-5">
            {[
              ['NFs encontradas', stats.invoices],
              ['Linhas de itens', stats.itemLines],
              ['Prontas', stats.ready],
              ['Revisar', stats.review],
              ['Duplicadas / sem match', stats.duplicates + stats.unmatched],
            ].map(([label, value]) => (
              <div key={String(label)} className="metric-item p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-100">{Number(value).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>

          <div className="glass-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {([
                ['all', 'Todas', stats.invoices],
                ['ready', 'Prontas', stats.ready],
                ['review', 'Revisar', stats.review],
                ['unmatched', 'Sem correspondência', stats.unmatched],
                ['duplicate', 'Duplicadas', stats.duplicates],
              ] as Array<[Filter, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilter(value);
                    setPage(1);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    filter === value
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                      : 'border-slate-800 bg-slate-900 text-slate-400'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
            <div className="relative min-w-[280px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar NF, cliente ou produto"
                className="form-input w-full py-2 pl-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-3">
            {pageRows.map(({ match, index }) => {
              const selected = match.candidates.find(
                (candidate) => candidate.licitacaoId === match.selectedLicitacaoId
              );
              const invoiceTotal = match.invoice.items.reduce((sum, item) => sum + item.valorTotal, 0);

              return (
                <article key={`${match.invoice.key}-${index}`} className="glass-card p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-mono text-sm font-bold text-slate-100">{match.invoice.numeroEmpenho}</h2>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceClasses(match)}`}>
                          {confidenceLabel(match)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Cliente {match.invoice.codigoCliente} · {match.invoice.nomeCliente || 'Nome não informado'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Lançamento {formatAppDate(match.invoice.dataEmpenho) || 'não informado'} ·{' '}
                        {match.invoice.items.length} item(ns) · {formatCurrency(invoiceTotal)}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                        {match.invoice.items.map((item) => `${item.codigoProduto} — ${item.descricao}`).join(' · ')}
                      </p>
                    </div>

                    <div className="w-full xl:w-[430px]">
                      {match.duplicateEmpenhoId ? (
                        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                          <CheckCircle2 size={15} />
                          Esta NF já existe e será ignorada.
                        </div>
                      ) : match.candidates.length > 0 ? (
                        <>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Pregão de destino
                          </label>
                          <select
                            value={match.selectedLicitacaoId || ''}
                            onChange={(event) => selectLicitacao(index, event.target.value)}
                            className="form-input mt-1 w-full text-xs"
                          >
                            <option value="">Selecione o pregão</option>
                            {match.candidates.map((candidate) => (
                              <option key={candidate.licitacaoId} value={candidate.licitacaoId}>
                                Pregão {candidate.numeroPregao} · abertura {formatAppDate(candidate.dataAbertura) || '-'} · venc. {formatAppDate(candidate.dataVencimento) || '-'}
                              </option>
                            ))}
                          </select>
                          {selected && (
                            <p className="mt-1 text-[10px] text-slate-500">
                              {selected.dateFit === 'inside'
                                ? 'A data da NF está dentro da vigência deste pregão.'
                                : 'Correspondência por cliente, produtos e preços; confira a data.'}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-950/20 p-3 text-xs text-red-200">
                          <AlertTriangle size={15} />
                          Nenhum pregão possui este cliente com todos os produtos e preços da NF.
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-400">
              Página {page} de {totalPages} · {visible.length.toLocaleString('pt-BR')} resultado(s)
              {importing && ` · Processando ${progress.completed}/${progress.total}`}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || importing}
                className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || importing}
                className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
              >
                Próxima
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={importing || stats.ready === 0}
                className="brand-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
              >
                {importing ? <LoaderCircle size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                {importing ? `Importando ${progress.completed}/${progress.total}` : `Importar ${stats.ready} NF(s) prontas`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
