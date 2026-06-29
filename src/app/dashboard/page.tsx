'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Bell,
  Filter,
  Layers,
  MonitorPlay,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { db } from '../../lib/db';
import { calculateDashboardStats, calculateItemSaldos } from '../../lib/saldo';
import { getVencimentoInfo } from '../../lib/vencimento';
import { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '../../types';
import StatsCard from '../../components/StatsCard';
import useDebounce from '../../lib/useDebounce';
import { useSessionRole } from '../../lib/useSessionRole';

type AlertTone = 'red' | 'amber' | 'emerald' | 'stone';
type BalanceMode = 'real' | 'utilizavel';

type DashboardAlert = {
  id: string;
  title: string;
  description: string;
  href?: string;
  tone: AlertTone;
};

type ItemSaldoWithLicitacao = ReturnType<typeof calculateItemSaldos>[number] & {
  licitacao?: Licitacao;
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function alertClasses(tone: AlertTone) {
  switch (tone) {
    case 'red':
      return 'text-red-700';
    case 'amber':
      return 'text-amber-700';
    case 'emerald':
      return 'text-emerald-700';
    default:
      return 'text-stone-600';
  }
}

function alertActionClasses(tone: AlertTone) {
  switch (tone) {
    case 'red':
      return 'border-red-700 bg-red-700 text-white';
    case 'amber':
      return 'border-amber-700 bg-amber-700 text-white';
    case 'emerald':
      return 'border-emerald-700 bg-emerald-700 text-white';
    default:
      return 'border-stone-800 bg-stone-800 text-white';
  }
}

export default function DashboardPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [itens, setItens] = useState<LicitacaoItem[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [empenhoItens, setEmpenhoItens] = useState<EmpenhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<number | 'todos'>('todos');
  const [selectedOrgao, setSelectedOrgao] = useState<string | 'todos'>('todos');
  const [codigoOrgaoFilter, setCodigoOrgaoFilter] = useState('');
  const [carteiraFilter, setCarteiraFilter] = useState<string | 'todos'>('todos');
  const [globalSearch, setGlobalSearch] = useState('');
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('real');
  const debouncedSearch = useDebounce(globalSearch, 250);
  const { isAdmin } = useSessionRole();

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoadError(null);
        const data = await db.getAppData();
        if (!active) return;
        setLicitacoes(data.licitacoes);
        setItens(data.itens);
        setEmpenhos(data.empenhos);
        setEmpenhoItens(data.empenhoItens);
      } catch (err) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        if (!active) return;
        console.error('Erro ao carregar dados do dashboard:', err);
        setLoadError(err instanceof Error ? err.message : 'Erro ao carregar dados do Supabase.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  const filterOptions = useMemo(() => {
    const years = Array.from(new Set(licitacoes.map((l) => l.ano))).sort((a, b) => b - a);
    const organs = Array.from(new Set(licitacoes.map((l) => l.orgao))).sort();
    const carteiras = Array.from(new Set(licitacoes.map((l) => l.carteira_regiao).filter(Boolean))) as string[];
    return { years, organs, carteiras: carteiras.sort() };
  }, [licitacoes]);

  const itemById = useMemo(() => new Map(itens.map((item) => [item.id, item])), [itens]);
  const licitacaoById = useMemo(() => new Map(licitacoes.map((lic) => [lic.id, lic])), [licitacoes]);

  const filteredLicitacoes = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return licitacoes.filter((lic) => {
      if (selectedYear !== 'todos' && lic.ano !== selectedYear) return false;
      if (selectedOrgao !== 'todos' && lic.orgao !== selectedOrgao) return false;
      if (codigoOrgaoFilter && !(lic.codigo_cliente || '').toLowerCase().includes(codigoOrgaoFilter.toLowerCase())) return false;
      if (carteiraFilter !== 'todos' && (lic.carteira_regiao || '') !== carteiraFilter) return false;

      if (!query) return true;

      const licItems = itens.filter((item) => item.licitacao_id === lic.id);
      const licEmpenhos = empenhos.filter((emp) => emp.licitacao_id === lic.id);
      const haystack = [
        lic.numero_pregao,
        lic.numero_processo,
        lic.orgao,
        lic.codigo_cliente,
        lic.carteira_regiao,
        lic.cidade,
        lic.estado,
        lic.orgao_contato,
        lic.orgao_email,
        ...licItems.flatMap((item) => [item.descricao, item.marca, item.codigo_produto, item.unidade]),
        ...licEmpenhos.map((emp) => emp.numero_empenho),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    carteiraFilter,
    codigoOrgaoFilter,
    debouncedSearch,
    empenhos,
    itens,
    licitacoes,
    selectedOrgao,
    selectedYear,
  ]);

  const balanceLicitacoes = useMemo(() => {
    if (balanceMode === 'real') return filteredLicitacoes;
    return filteredLicitacoes.filter((lic) => getVencimentoInfo(lic.data_vencimento).status !== 'vencido');
  }, [balanceMode, filteredLicitacoes]);

  const filteredLicIds = useMemo(() => new Set(balanceLicitacoes.map((lic) => lic.id)), [balanceLicitacoes]);

  const stats = useMemo(() => {
    const filteredItems = itens.filter((item) => filteredLicIds.has(item.licitacao_id));
    const filteredEmpenhos = empenhos.filter((emp) => filteredLicIds.has(emp.licitacao_id));
    const filteredEmpIds = new Set(filteredEmpenhos.map((emp) => emp.id));
    const filteredEmpenhoItens = empenhoItens.filter((item) => filteredEmpIds.has(item.empenho_id));

    return calculateDashboardStats(balanceLicitacoes, filteredItems, filteredEmpenhos, filteredEmpenhoItens, 'todos');
  }, [balanceLicitacoes, empenhoItens, empenhos, filteredLicIds, itens]);

  const allItemSaldos = useMemo<ItemSaldoWithLicitacao[]>(() => {
    return calculateItemSaldos(itens, empenhos, empenhoItens)
      .map((saldo) => {
        const item = itemById.get(saldo.itemId);
        return {
          ...saldo,
          licitacao: item ? licitacaoById.get(item.licitacao_id) : undefined,
        };
      })
      .filter((saldo) => saldo.licitacao && filteredLicIds.has(saldo.licitacao.id));
  }, [empenhoItens, empenhos, filteredLicIds, itemById, itens, licitacaoById]);

  const availableItems = useMemo(() => {
    return allItemSaldos
      .filter((item) => item.saldoQuantidade > 0)
      .sort((a, b) => b.saldoFinanceiro - a.saldoFinanceiro);
  }, [allItemSaldos]);

  const commitmentPercentage = useMemo(() => {
    if (stats.totalWon === 0) return 0;
    return Math.round((stats.totalCommitted / stats.totalWon) * 100);
  }, [stats]);
  const latestUpdate = useMemo(
    () => licitacoes.map((item) => item.updated_at).filter(Boolean).sort().at(-1) || null,
    [licitacoes]
  );

  const balanceByCarteira = useMemo(() => {
    const grouped = new Map<string, number>();
    availableItems.forEach((item) => {
      const key = item.licitacao?.carteira_regiao || 'Sem carteira';
      grouped.set(key, (grouped.get(key) || 0) + item.saldoFinanceiro);
    });
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [availableItems]);

  const alerts = useMemo<DashboardAlert[]>(() => {
    const nextAlerts: DashboardAlert[] = [];

    filteredLicitacoes.forEach((lic) => {
      const vencimento = getVencimentoInfo(lic.data_vencimento, 30);
      if (vencimento.status === 'vencido') {
        nextAlerts.push({
          id: `vencida-${lic.id}`,
          title: `Ata vencida: Pregão ${lic.numero_pregao}`,
          description: `${lic.orgao} · ${vencimento.label}`,
          href: `/dashboard/licitacoes/${lic.id}`,
          tone: 'red',
        });
      } else if (vencimento.status === 'proximo') {
        nextAlerts.push({
          id: `vence-${lic.id}`,
          title: `Vence em breve: Pregão ${lic.numero_pregao}`,
          description: `${lic.orgao} · ${vencimento.label}`,
          href: `/dashboard/licitacoes/${lic.id}`,
          tone: 'amber',
        });
      }

    });

    availableItems.slice(0, 3).forEach((item) => {
      if (item.saldoFinanceiro >= 10000) {
        nextAlerts.push({
          id: `saldo-${item.itemId}`,
          title: `Saldo alto parado: item #${item.numeroItem}`,
          description: `${item.licitacao?.orgao || 'Órgão não identificado'} · ${formatCurrency(item.saldoFinanceiro)} disponível`,
          href: item.licitacao ? `/dashboard/licitacoes/${item.licitacao.id}` : undefined,
          tone: 'emerald',
        });
      }
    });

    return nextAlerts.slice(0, 5);
  }, [availableItems, filteredLicitacoes]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-300 border-t-transparent" />
        <p className="text-sm text-stone-400">Carregando métricas e análises...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-overview space-y-7 pb-10 animate-fade-in">
      <div className="page-hero flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="lumina-kicker mb-2">Operação · Licitações</p>
          <h1 className="text-3xl font-semibold text-stone-50 md:text-4xl">Painel Executivo</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
            Visão integrada de contratos, empenhos, vencimentos e saldos disponíveis.
          </p>
          {latestUpdate && (
            <p className="mt-2 text-[11px] font-medium text-stone-500">
              Dados reais atualizados em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(latestUpdate))}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:justify-end">
          <Link href="/dashboard/apresentacao" className="brand-secondary flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
            <MonitorPlay size={16} />
            <span>Apresentar</span>
          </Link>
          <Link href="/dashboard/licitacoes" className="brand-secondary flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
            <Layers size={16} />
            <span>Ver Licitações</span>
          </Link>
          {isAdmin && (
          <Link href="/dashboard/licitacoes/nova" className="brand-button col-span-2 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all">
            <Plus size={16} />
            <span>Cadastrar</span>
          </Link>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-400/25 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Nao consegui carregar os dados do Painel Geral.</p>
          <p className="mt-1 text-red-700">{loadError}</p>
          <Link href="/login" className="mt-3 inline-flex rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:border-red-300">
            Entrar novamente
          </Link>
        </div>
      ) : null}

      {!loadError && licitacoes.length === 0 && (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
          <p className="text-sm font-semibold text-amber-900">Nenhuma licitacao carregada no painel.</p>
          <p className="mt-1 text-sm text-amber-800">
            Use o importador Halex para buscar os pregoes do Paulo Roberto no Power BI.
          </p>
          {isAdmin && (
            <Link href="/dashboard/import/halex-powerbi" className="brand-button mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold">
              Importar Halex
            </Link>
          )}
        </div>
      )}

      <details className="glass-panel group p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-stone-600">
          <Filter size={14} className="text-amber-300" />
          <span>Filtros do painel</span>
          <span className="ml-auto text-[10px] text-stone-400 group-open:hidden">Abrir</span>
          <span className="ml-auto hidden text-[10px] text-stone-400 group-open:inline">Fechar</span>
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(260px,2fr)_minmax(130px,0.8fr)_minmax(240px,1.6fr)_minmax(150px,1fr)_minmax(145px,0.9fr)_minmax(170px,1fr)]">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-stone-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Buscar pregão, órgão, item, marca, código, empenho, cidade..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="form-input w-full py-2 pl-9 text-xs"
            />
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
            className="form-input py-2 text-xs"
          >
            <option value="todos">Todos os anos</option>
            {filterOptions.years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select value={selectedOrgao} onChange={(e) => setSelectedOrgao(e.target.value)} className="form-input py-2 text-xs">
            <option value="todos">Todos os órgãos</option>
            {filterOptions.organs.map((orgao) => (
              <option key={orgao} value={orgao}>{orgao}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Código do órgão"
            value={codigoOrgaoFilter}
            onChange={(e) => setCodigoOrgaoFilter(e.target.value)}
            className="form-input py-2 text-xs"
          />
          <select value={carteiraFilter} onChange={(e) => setCarteiraFilter(e.target.value)} className="form-input py-2 text-xs">
            <option value="todos">Todas carteiras</option>
            {filterOptions.carteiras.map((carteira) => (
              <option key={carteira} value={carteira}>{carteira}</option>
            ))}
          </select>
          <select value={balanceMode} onChange={(e) => setBalanceMode(e.target.value as BalanceMode)} className="form-input py-2 text-xs">
            <option value="real">Saldo real</option>
            <option value="utilizavel">Saldo utilizavel</option>
          </select>
        </div>
      </details>

      <div className="metric-strip grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Valor Total Ganho"
          value={formatCurrency(stats.totalWon)}
          icon={<Award size={22} />}
          gradient="from-amber-400/20 to-stone-100/5"
          description="Itens marcados como ganho"
          glow
        />
        <StatsCard
          title="Valor Empenhado"
          value={formatCurrency(stats.totalCommitted)}
          icon={<TrendingUp size={22} />}
          gradient="from-stone-200/12 to-amber-400/5"
          description={`${commitmentPercentage}% do saldo ganho consumido`}
        />
        <StatsCard
          title="Saldo Financeiro"
          value={formatCurrency(stats.totalRemaining)}
          icon={<TrendingDown size={22} className="text-emerald-300" />}
          gradient="from-emerald-400/15 to-teal-300/5"
          description="Total disponível para novas aquisições"
        />
        <StatsCard
          title="Licitações Ativas"
          value={stats.activeLicitacoesCount}
          icon={<Layers size={22} />}
          gradient="from-amber-400/16 to-yellow-200/5"
          description="Contratos em andamento nos filtros atuais"
        />
      </div>

      <div className="dashboard-detail-grid grid grid-cols-1 gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <section className="glass-card p-5 md:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-amber-300" />
                <h3 className="text-lg font-semibold text-stone-50">Alertas operacionais</h3>
              </div>
              <p className="mt-1 text-xs text-stone-500">Vencimentos, documentos e saldos que pedem atenção.</p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-bold text-amber-300">
              {alerts.length}
            </span>
          </div>
          {alerts.length === 0 ? (
            <div className="border-l-2 border-emerald-500 py-2 pl-4 text-sm text-emerald-700">
              Nenhum alerta crítico nos filtros atuais.
            </div>
          ) : (
            <div className="mt-1 space-y-2">
              {alerts.map((alert) => {
                const content = (
                  <div className="rounded-xl border border-stone-900/7 bg-stone-50/65 p-3.5 transition-all hover:-translate-y-0.5 hover:border-amber-500/25 hover:bg-white hover:shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={17} className={`mt-0.5 shrink-0 ${alertClasses(alert.tone)}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{alert.title}</p>
                        <p className="mt-1 text-xs opacity-80">{alert.description}</p>
                      </div>
                      {alert.href && (
                        <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-bold shadow-sm ${alertActionClasses(alert.tone)}`}>
                          Ver
                          <ArrowRight size={12} />
                        </span>
                      )}
                    </div>
                  </div>
                );
                return alert.href ? <Link key={alert.id} href={alert.href}>{content}</Link> : <div key={alert.id}>{content}</div>;
              })}
            </div>
          )}
        </section>

        <section className="glass-card p-5 md:p-6">
          <h3 className="text-lg font-semibold text-stone-50">Saldo por carteira</h3>
          <p className="mt-1 text-xs text-stone-500">Distribuição executiva do saldo disponível.</p>
          <div className="mt-5 space-y-4">
            {balanceByCarteira.length === 0 ? (
              <p className="text-sm text-stone-500">Sem saldo por carteira nos filtros atuais.</p>
            ) : balanceByCarteira.map((row) => (
              <div key={row.label}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-stone-800">{row.label}</span>
                  <span className="money-value text-xs font-bold text-stone-700">{formatCurrency(row.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                    style={{ width: `${Math.max(8, (row.value / (balanceByCarteira[0]?.value || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link href="/dashboard/licitacoes" className="brand-secondary mt-4 flex items-center justify-center rounded-lg px-3 py-2 text-xs font-bold">
            Consultar detalhes operacionais
          </Link>
        </section>
      </div>

    </div>
  );
}
