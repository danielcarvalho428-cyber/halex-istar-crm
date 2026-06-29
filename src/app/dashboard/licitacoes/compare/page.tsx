'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  Map,
  Search,
  Target,
  TrendingUp,
} from 'lucide-react';
import { db } from '../../../../lib/db';
import {
  buildCommercialComparison,
  type CommercialClientComparison,
} from '../../../../lib/commercial-comparison';
import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '../../../../types';

function currency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number | null) {
  if (value === null) return '—';
  return `${Math.round(value)}%`;
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function ComparePage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [items, setItems] = useState<LicitacaoItem[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [empenhoItems, setEmpenhoItems] = useState<EmpenhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [region, setRegion] = useState('todas');
  const [search, setSearch] = useState('');
  const [onlyRecovery, setOnlyRecovery] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function load() {
      try {
        const data = await db.getAppData();
        setLicitacoes(data.licitacoes);
        setItems(data.itens);
        setEmpenhos(data.empenhos);
        setEmpenhoItems(data.empenhoItens);
      } catch (error) {
        console.error(error);
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a comparação.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const comparison = useMemo(
    () => buildCommercialComparison(licitacoes, items, empenhos, empenhoItems),
    [empenhoItems, empenhos, items, licitacoes]
  );

  const regions = useMemo(
    () => comparison.regions.map((item) => item.region).sort(),
    [comparison.regions]
  );

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return comparison.clients.filter((client) => {
      if (region !== 'todas' && client.region !== region) return false;
      if (onlyRecovery && client.recoveryOpportunity <= 0) return false;
      if (!query) return true;
      return [
        client.client,
        client.clientCode,
        client.region,
        client.state,
        ...client.products.flatMap((product) => [product.code, product.description]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [comparison.clients, onlyRecovery, region, search]);

  const totals = useMemo(() => {
    return filteredClients.reduce(
      (total, client) => {
        total.won2025 += client.metrics2025.won;
        total.sold2025 += client.metrics2025.sold;
        total.won2026 += client.metrics2026.won;
        total.sold2026 += client.metrics2026.sold;
        total.recovery += client.recoveryOpportunity;
        if (client.metrics2025.won > 0 && client.metrics2026.won === 0) total.lostClients += 1;
        return total;
      },
      { won2025: 0, sold2025: 0, won2026: 0, sold2026: 0, recovery: 0, lostClients: 0 }
    );
  }, [filteredClients]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const effectivePage = Math.min(currentPage, pageCount);
  const paginatedClients = useMemo(
    () => filteredClients.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, filteredClients]
  );

  function exportCsv() {
    const header = [
      'Região',
      'Código cliente',
      'Cliente',
      'Ganho 2025',
      'Vendido 2025',
      'Ganho 2026',
      'Vendido 2026',
      'Variação ganho',
      'Retenção',
      'Potencial recuperação',
    ];
    const rows = filteredClients.map((client) => [
      client.region,
      client.clientCode || '',
      client.client,
      client.metrics2025.won.toFixed(2),
      client.metrics2025.sold.toFixed(2),
      client.metrics2026.won.toFixed(2),
      client.metrics2026.sold.toFixed(2),
      client.wonChange.toFixed(2),
      client.retentionPercent === null ? '' : client.retentionPercent.toFixed(1),
      client.recoveryOpportunity.toFixed(2),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `comparativo-comercial-2025-2026-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-300 border-t-transparent" />
        <p className="text-sm text-stone-400">Montando comparativo comercial 2025 × 2026...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="page-hero flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="lumina-kicker mb-2">Inteligência comercial · Halex Istar</p>
          <h1 className="text-3xl font-semibold text-stone-50 md:text-4xl">
            Comparativo regional 2025 × 2026
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
            Compara os mesmos clientes por código, independentemente do número do pregão. Mostra o
            valor ganho, o que efetivamente vendeu e o potencial de recuperação em 2026.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/licitacoes" className="brand-secondary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
            <ArrowLeft size={15} />
            Licitações
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredClients.length === 0}
            className="brand-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            <Download size={15} />
            Exportar para Halex
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-400/20 bg-red-950/20 p-4 text-sm text-red-200">
          {loadError}
        </div>
      )}

      <div className="metric-strip grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Ganho 2025" value={currency(totals.won2025)} icon={<TrendingUp size={18} />} />
        <MetricCard label="Vendido 2025" value={currency(totals.sold2025)} icon={<Building2 size={18} />} tone="emerald" />
        <MetricCard label="Ganho 2026" value={currency(totals.won2026)} icon={<TrendingUp size={18} />} />
        <MetricCard label="Vendido 2026" value={currency(totals.sold2026)} icon={<Building2 size={18} />} tone="emerald" />
        <MetricCard label="Potencial de recuperação" value={currency(totals.recovery)} icon={<Target size={18} />} tone="amber" />
      </div>

      <section className="glass-card p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-50">Visão por região</h3>
            <p className="mt-1 text-xs text-stone-500">Onde a redução de carteira está mais concentrada.</p>
          </div>
          <Map size={19} className="text-amber-300" />
        </div>
        <div className="grid grid-cols-1 border-y border-stone-900/8 lg:grid-cols-3">
          {comparison.regions.map((item) => {
            const loss = item.metrics2026.won - item.metrics2025.won;
            return (
              <button
                type="button"
                key={item.region}
                onClick={() => {
                  setRegion(region === item.region ? 'todas' : item.region);
                  setCurrentPage(1);
                }}
                className={`border-b border-stone-900/8 p-4 text-left transition-colors last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${
                  region === item.region
                    ? 'bg-amber-100/55'
                    : 'hover:bg-amber-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-stone-100">Região {item.region}</p>
                    <p className="mt-1 text-[11px] text-stone-500">
                      {item.clients} clientes · {item.clientsAtRisk} com oportunidade
                    </p>
                  </div>
                  <span className="money-value text-xs font-bold text-amber-300">
                    {currency(item.recoveryOpportunity)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-stone-500">Ganho 2025</p>
                    <p className="money-value mt-1 font-semibold text-stone-200">{currency(item.metrics2025.won)}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">Ganho 2026</p>
                    <p className="money-value mt-1 font-semibold text-stone-200">{currency(item.metrics2026.won)}</p>
                  </div>
                </div>
                <p className={`mt-3 flex items-center gap-1 text-xs font-semibold ${loss < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                  {loss < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                  {currency(Math.abs(loss))} {loss < 0 ? 'abaixo de 2025' : 'acima de 2025'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="glass-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            className="form-input w-full pl-9 text-sm"
            placeholder="Buscar cliente, código ou produto..."
          />
        </div>
        <select
          value={region}
          onChange={(event) => {
            setRegion(event.target.value);
            setCurrentPage(1);
          }}
          className="form-input text-sm"
        >
          <option value="todas">Todas as regiões</option>
          {regions.map((item) => <option key={item} value={item}>Região {item}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200/10 bg-black/20 px-3 py-2 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={onlyRecovery}
            onChange={(event) => {
              setOnlyRecovery(event.target.checked);
              setCurrentPage(1);
            }}
            className="accent-amber-300"
          />
          Somente oportunidades
        </label>
      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-amber-200/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300">
              Clientes comparados
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              {filteredClients.length} clientes · {totals.lostClients} sem ganho registrado em 2026
            </p>
          </div>
        </div>

        {filteredClients.length === 0 ? (
          <div className="p-10 text-center text-sm text-stone-500">
            Nenhum cliente encontrado com os filtros atuais.
          </div>
        ) : (
          <>
          <div className="divide-y divide-stone-900/8 lg:hidden">
            {paginatedClients.map((client) => (
              <ClientCard
                key={client.key}
                client={client}
                expanded={expandedClient === client.key}
                onToggle={() => setExpandedClient(expandedClient === client.key ? null : client.key)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[1060px] w-full text-left text-xs">
              <thead className="bg-black/30 text-stone-500">
                <tr>
                  <th className="min-w-[220px] px-3 py-3">Região / Cliente</th>
                  <th className="min-w-[112px] whitespace-nowrap px-3 py-3 text-right">Ganho 2025</th>
                  <th className="min-w-[112px] whitespace-nowrap px-3 py-3 text-right">Vendido 2025</th>
                  <th className="min-w-[112px] whitespace-nowrap px-3 py-3 text-right">Ganho 2026</th>
                  <th className="min-w-[112px] whitespace-nowrap px-3 py-3 text-right">Vendido 2026</th>
                  <th className="min-w-[120px] whitespace-nowrap px-3 py-3 text-right">Variação ganho</th>
                  <th className="px-3 py-3 text-center">Retenção</th>
                  <th className="min-w-[115px] whitespace-nowrap px-3 py-3 text-right">Recuperação</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/10">
                {paginatedClients.map((client) => (
                  <ClientRows
                    key={client.key}
                    client={client}
                    expanded={expandedClient === client.key}
                    onToggle={() => setExpandedClient(expandedClient === client.key ? null : client.key)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filteredClients.length > pageSize && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-900/8 px-5 py-4 text-xs text-stone-500 sm:flex-row">
              <p>
                Exibindo {(effectivePage - 1) * pageSize + 1}–{Math.min(effectivePage * pageSize, filteredClients.length)} de {filteredClients.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={effectivePage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="px-2 font-semibold text-stone-700">{effectivePage} / {pageCount}</span>
                <button
                  type="button"
                  disabled={effectivePage === pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = 'stone',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'stone' | 'emerald' | 'amber';
}) {
  const toneClasses = {
    stone: 'text-stone-100',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
  };
  return (
    <div className="metric-item p-4">
      <div className="flex items-center justify-between text-stone-500">
        <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
        {icon}
      </div>
      <p className={`money-value mt-3 text-xl font-semibold ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}

function ClientCard({
  client,
  expanded,
  onToggle,
}: {
  client: CommercialClientComparison;
  expanded: boolean;
  onToggle: () => void;
}) {
  const changeIsNegative = client.wonChange < 0;
  return (
    <article className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="readable-name text-sm font-bold text-stone-900">{client.client}</p>
          <p className="mt-1 text-[10px] text-stone-500">
            Região {client.region}{client.state ? ` · ${client.state}` : ''}
            {client.clientCode ? ` · Código ${client.clientCode}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Ocultar produtos' : 'Mostrar produtos'}
          className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 border-y border-stone-900/8">
        {[
          ['Ganho 2025', currency(client.metrics2025.won), 'text-stone-800'],
          ['Vendido 2025', currency(client.metrics2025.sold), 'text-emerald-700'],
          ['Ganho 2026', currency(client.metrics2026.won), 'text-stone-800'],
          ['Vendido 2026', currency(client.metrics2026.sold), 'text-emerald-700'],
        ].map(([label, value, tone], index) => (
          <div key={label} className={`py-3 ${index % 2 ? 'border-l border-stone-900/8 pl-3' : 'pr-3'} ${index > 1 ? 'border-t border-stone-900/8' : ''}`}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
            <p className={`money-value mt-1 text-xs font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase text-stone-400">Variação</p>
          <p className={`money-value mt-1 text-xs font-bold ${changeIsNegative ? 'text-red-600' : 'text-emerald-700'}`}>
            {client.wonChange > 0 ? '+' : ''}{currency(client.wonChange)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-stone-400">Retenção</p>
          <p className="mt-1 text-xs font-bold text-stone-800">{percent(client.retentionPercent)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase text-stone-400">Recuperação</p>
          <p className="money-value mt-1 text-xs font-bold text-amber-800">{currency(client.recoveryOpportunity)}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-stone-900/8 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Produtos prioritários</p>
          <div className="mt-2 divide-y divide-stone-900/8">
            {client.products.slice(0, 8).map((product) => (
              <div key={product.key} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="readable-name text-xs font-semibold text-stone-800">{product.description}</p>
                  {product.code && <p className="mt-0.5 text-[9px] text-stone-500">Código {product.code}</p>}
                </div>
                <p className="money-value shrink-0 text-[10px] font-bold text-amber-800">{currency(product.recoveryOpportunity)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function ClientRows({
  client,
  expanded,
  onToggle,
}: {
  client: CommercialClientComparison;
  expanded: boolean;
  onToggle: () => void;
}) {
  const changeIsNegative = client.wonChange < 0;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors hover:bg-amber-200/5">
        <td className="min-w-[220px] px-3 py-4">
          <p className="readable-name font-semibold text-stone-100">{client.client}</p>
          <p className="mt-1 text-[10px] text-stone-500">
            Região {client.region}{client.state ? ` · ${client.state}` : ''}
            {client.clientCode ? ` · Código ${client.clientCode}` : ''}
          </p>
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-stone-300">{currency(client.metrics2025.won)}</td>
        <td className="whitespace-nowrap px-3 py-4 text-right font-mono font-semibold text-emerald-300">{currency(client.metrics2025.sold)}</td>
        <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-stone-300">{currency(client.metrics2026.won)}</td>
        <td className="whitespace-nowrap px-3 py-4 text-right font-mono font-semibold text-emerald-300">{currency(client.metrics2026.sold)}</td>
        <td className={`whitespace-nowrap px-3 py-4 text-right font-mono font-semibold ${changeIsNegative ? 'text-red-300' : 'text-emerald-300'}`}>
          {client.wonChange > 0 ? '+' : ''}{currency(client.wonChange)}
        </td>
        <td className="px-3 py-4 text-center">
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
            (client.retentionPercent || 0) >= 100
              ? 'bg-emerald-400/10 text-emerald-300'
              : 'bg-red-400/10 text-red-300'
          }`}>
            {percent(client.retentionPercent)}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-right font-mono font-bold text-amber-300">
          {currency(client.recoveryOpportunity)}
        </td>
        <td className="px-3 py-4 text-stone-500">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-black/25 px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Produtos do cliente
                </p>
                <p className="mt-1 text-[11px] text-stone-500">
                  Oportunidade por produto = vendido em 2025 menos valor ganho em 2026.
                </p>
              </div>
              <span className="text-[11px] text-stone-500">{client.products.length} produtos</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-amber-200/10">
              <table className="min-w-[900px] w-full text-xs">
                <thead className="bg-black/30 text-stone-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="money-cell px-3 py-2">Ganho 2025</th>
                    <th className="money-cell px-3 py-2">Vendido 2025</th>
                    <th className="money-cell px-3 py-2">Ganho 2026</th>
                    <th className="money-cell px-3 py-2">Vendido 2026</th>
                    <th className="money-cell px-3 py-2">Recuperação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/10">
                  {client.products.map((product) => (
                    <tr key={product.key}>
                      <td className="px-3 py-3">
                        <p className="readable-name font-medium text-stone-200">{product.description}</p>
                        <p className="mt-1 text-[10px] text-stone-500">
                          {product.code ? `Código ${product.code} · ` : ''}{product.unit}
                        </p>
                      </td>
                      <td className="money-cell px-3 py-3 font-mono text-stone-400">{currency(product.metrics2025.won)}</td>
                      <td className="money-cell px-3 py-3 font-mono text-emerald-300">{currency(product.metrics2025.sold)}</td>
                      <td className="money-cell px-3 py-3 font-mono text-stone-400">{currency(product.metrics2026.won)}</td>
                      <td className="money-cell px-3 py-3 font-mono text-emerald-300">{currency(product.metrics2026.sold)}</td>
                      <td className="money-cell px-3 py-3 font-mono font-bold text-amber-300">{currency(product.recoveryOpportunity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
