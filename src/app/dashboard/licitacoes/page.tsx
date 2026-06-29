'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  Bookmark,
  Plus, 
  Search, 
  Eye, 
  Trash2, 
  Copy, 
  Coins, 
  Inbox, 
  Filter,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { db } from '../../../lib/db';
import { calculateLicitacaoSummary } from '../../../lib/saldo';
import { formatAppDate } from '../../../lib/date';
import { formatVencimentoDate, getVencimentoClasses, getVencimentoInfo } from '../../../lib/vencimento';
import { Licitacao, Empenho, EmpenhoItem, LicitacaoStatus } from '../../../types';
import StatusBadge from '../../../components/StatusBadge';
import { useSessionRole } from '../../../lib/useSessionRole';

type SortOrder =
  | 'padrao'
  | 'abertura_desc'
  | 'abertura_asc'
  | 'maior_saldo'
  | 'menor_saldo'
  | 'sem_pedidos'
  | 'maior_empenhado';

type VencimentoFilter = 'todos' | 'vigentes' | 'vencidos';

type SavedLicitacaoView = {
  id: string;
  name: string;
  filters: {
    searchQuery: string;
    filterYear: string;
    filterOrgao: string;
    filterCodigoOrgao: string;
    filterCarteira: string;
    filterStatus: string;
    filterVencimento?: VencimentoFilter;
    sortOrder?: SortOrder;
  };
};

const SAVED_VIEWS_KEY = 'licitasaldo_saved_licitacao_views';

export default function LicitacoesPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [empenhoItens, setEmpenhoItens] = useState<EmpenhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState<string>('todos');
  const [filterOrgao, setFilterOrgao] = useState<string>('todos');
  const [filterCodigoOrgao, setFilterCodigoOrgao] = useState('');
  const [filterCarteira, setFilterCarteira] = useState<string>('todos');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterVencimento, setFilterVencimento] = useState<VencimentoFilter>('todos');
  const [sortOrder, setSortOrder] = useState<SortOrder>('padrao');
  const [currentPage, setCurrentPage] = useState(1);
  const [savedViews, setSavedViews] = useState<SavedLicitacaoView[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = window.localStorage.getItem(SAVED_VIEWS_KEY);
      return stored ? JSON.parse(stored) as SavedLicitacaoView[] : [];
    } catch {
      window.localStorage.removeItem(SAVED_VIEWS_KEY);
      return [];
    }
  });
  const [selectedViewId, setSelectedViewId] = useState('');
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState('');
  const { isAdmin } = useSessionRole();

  // Load datasets
  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await db.getAppData();
      const lData = data.licitacoes;
      const eData = data.empenhos;
      const eiData = data.empenhoItens;
      const allItems = data.itens;

      const itemsByLicitacao = new Map<string, typeof allItems>();
      allItems.forEach((item) => {
        const current = itemsByLicitacao.get(item.licitacao_id) || [];
        current.push(item);
        itemsByLicitacao.set(item.licitacao_id, current);
      });

      const detailedLicitacoes = lData.map((lic) => ({
        ...lic,
        itens: (itemsByLicitacao.get(lic.id) || []).sort((a, b) => a.numero_item - b.numero_item),
      }));

      setLicitacoes(detailedLicitacoes);
      setEmpenhos(eData);
      setEmpenhoItens(eiData);
    } catch (err) {
      console.error('Erro ao carregar licitações:', err);
      setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar as licitações.');
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

  const persistSavedViews = (views: SavedLicitacaoView[]) => {
    setSavedViews(views);
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  };

  const applySavedView = (id: string) => {
    setSelectedViewId(id);
    const view = savedViews.find((item) => item.id === id);
    if (!view) return;
    setSearchQuery(view.filters.searchQuery);
    setFilterYear(view.filters.filterYear);
    setFilterOrgao(view.filters.filterOrgao);
    setFilterCodigoOrgao(view.filters.filterCodigoOrgao);
    setFilterCarteira(view.filters.filterCarteira);
    setFilterStatus(view.filters.filterStatus);
    setFilterVencimento(view.filters.filterVencimento || 'todos');
    setSortOrder(view.filters.sortOrder || 'padrao');
    setCurrentPage(1);
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedLicitacaoView = {
      id: crypto.randomUUID(),
      name: name.slice(0, 60),
      filters: {
        searchQuery,
        filterYear,
        filterOrgao,
        filterCodigoOrgao,
        filterCarteira,
        filterStatus,
        filterVencimento,
        sortOrder,
      },
    };
    persistSavedViews([...savedViews, view]);
    setSelectedViewId(view.id);
    setViewName('');
    setSavingView(false);
  };

  const deleteSelectedView = () => {
    if (!selectedViewId) return;
    persistSavedViews(savedViews.filter((view) => view.id !== selectedViewId));
    setSelectedViewId('');
  };

  // Duplicate a bidding
  const handleDuplicate = async (id: string, number: string) => {
    if (confirm(`Deseja duplicar a licitação Pregão ${number}? Todos os itens serão copiados.`)) {
      try {
        await db.duplicateLicitacao(id);
        alert('Licitação duplicada com sucesso!');
        loadData();
      } catch (err) {
        alert('Erro ao duplicar licitação.');
        console.error(err);
      }
    }
  };

  // Delete a bidding
  const handleDelete = async (id: string, number: string) => {
    if (confirm(`ATENÇÃO: Tem certeza que deseja excluir permanentemente o Pregão ${number}? Todos os itens e empenhos vinculados serão apagados!`)) {
      try {
        await db.deleteLicitacao(id);
        alert('Licitação excluída com sucesso.');
        loadData();
      } catch (err) {
        alert('Erro ao excluir licitação.');
        console.error(err);
      }
    }
  };

  // Unique filter lists
  const filterOptions = useMemo(() => {
    const years = Array.from(new Set(licitacoes.map(l => l.ano.toString()))).sort((a, b) => b.localeCompare(a));
    const organs = Array.from(new Set(licitacoes.map(l => l.orgao))).sort();
    const carteiras = Array.from(new Set(licitacoes.map(l => l.carteira_regiao).filter(Boolean))) as string[];
    return { years, organs, carteiras: carteiras.sort() };
  }, [licitacoes]);

  const licitacoesById = useMemo(() => {
    return new Map(licitacoes.map((licitacao) => [licitacao.id, licitacao]));
  }, [licitacoes]);

  // Compute detailed metrics for each bidding
  const licitacoesSummaries = useMemo(() => {
    return licitacoes.map(lic => {
      const items = lic.itens || [];
      return calculateLicitacaoSummary(lic, items, empenhos, empenhoItens);
    });
  }, [licitacoes, empenhos, empenhoItens]);

  function openingTime(value?: string | null) {
    if (!value) return 0;
    const time = new Date(`${value}T00:00:00`).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function compareByPregaoNumber(a: string, b: string) {
    return b.localeCompare(a, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  // Filter and sort biddings list
  const filteredSummaries = useMemo(() => {
    const filtered = licitacoesSummaries.filter(summary => {
      // Year Filter
      if (filterYear !== 'todos' && summary.ano.toString() !== filterYear) return false;
      // Organ Filter
      if (filterOrgao !== 'todos' && summary.orgao !== filterOrgao) return false;
      const lic = licitacoesById.get(summary.licitacaoId);
      const codigoOrgao = lic?.codigo_cliente || '';
      if (filterCodigoOrgao && !codigoOrgao.toLowerCase().includes(filterCodigoOrgao.toLowerCase())) return false;
      if (filterCarteira !== 'todos' && (lic?.carteira_regiao || '') !== filterCarteira) return false;
      // Status Filter
      if (filterStatus !== 'todos' && summary.status !== filterStatus) return false;
      if (filterVencimento !== 'todos') {
        const vencimentoStatus = getVencimentoInfo(lic?.data_vencimento).status;
        if (filterVencimento === 'vigentes' && vencimentoStatus === 'vencido') return false;
        if (filterVencimento === 'vencidos' && vencimentoStatus !== 'vencido') return false;
      }
      // Text Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPregao = summary.numeroPregao.toLowerCase().includes(query);
        const matchesOrgao = summary.orgao.toLowerCase().includes(query);
        const matchesCodigoOrgao = codigoOrgao.toLowerCase().includes(query);
        const matchesProcesso = (lic?.numero_processo || '').toLowerCase().includes(query);
        const matchesContato = (lic?.orgao_contato || '').toLowerCase().includes(query);
        const matchesItems = (lic?.itens || []).some((item) =>
          [item.descricao, item.marca, item.codigo_produto, item.unidade]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query)
        );
        if (!matchesPregao && !matchesOrgao && !matchesCodigoOrgao && !matchesProcesso && !matchesContato && !matchesItems) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const licA = licitacoesById.get(a.licitacaoId);
      const licB = licitacoesById.get(b.licitacaoId);
      switch (sortOrder) {
        case 'abertura_desc':
          return openingTime(licB?.data_abertura) - openingTime(licA?.data_abertura)
            || compareByPregaoNumber(a.numeroPregao, b.numeroPregao);
        case 'abertura_asc':
          return openingTime(licA?.data_abertura) - openingTime(licB?.data_abertura)
            || compareByPregaoNumber(a.numeroPregao, b.numeroPregao);
        case 'maior_saldo':
          return b.saldoRestante - a.saldoRestante
            || openingTime(licB?.data_abertura) - openingTime(licA?.data_abertura);
        case 'menor_saldo':
          return a.saldoRestante - b.saldoRestante
            || openingTime(licB?.data_abertura) - openingTime(licA?.data_abertura);
        case 'sem_pedidos':
          return Number(a.empenhosAtivosCount > 0) - Number(b.empenhosAtivosCount > 0)
            || b.saldoRestante - a.saldoRestante
            || openingTime(licB?.data_abertura) - openingTime(licA?.data_abertura);
        case 'maior_empenhado':
          return b.valorTotalEmpenhado - a.valorTotalEmpenhado
            || openingTime(licB?.data_abertura) - openingTime(licA?.data_abertura);
        case 'padrao':
        default:
          return 0;
      }
    });
    return sorted;
  }, [licitacoesSummaries, licitacoesById, filterYear, filterOrgao, filterCodigoOrgao, filterCarteira, filterStatus, filterVencimento, searchQuery, sortOrder]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filteredSummaries.length / pageSize));
  const effectivePage = Math.min(currentPage, pageCount);
  const paginatedSummaries = useMemo(
    () => filteredSummaries.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [effectivePage, filteredSummaries]
  );

  // Totals for the filtered subset
  const filteredTotals = useMemo(() => {
    return filteredSummaries.reduce((acc, curr) => {
      acc.won += curr.valorTotalGanho;
      acc.committed += curr.valorTotalEmpenhado;
      acc.remaining += curr.saldoRestante;
      return acc;
    }, { won: 0, committed: 0, remaining: 0 });
  }, [filteredSummaries]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Carregando lista de licitações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Title Section */}
      <div className="page-hero flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="lumina-kicker mb-2">Gestão comercial · Paulo Roberto</p>
          <h1 className="text-3xl font-semibold text-stone-50">Licitações</h1>
          <p className="text-stone-400 text-sm mt-1">Encontre pregões, confira saldos e lance empenhos sem sair da lista.</p>
        </div>
        {isAdmin && (
        <div className="flex">
          <Link
            href="/dashboard/licitacoes/nova"
            className="brand-button flex items-center justify-center gap-2 px-4 py-2.5 font-semibold text-sm rounded-lg transition-all shrink-0"
          >
            <Plus size={16} />
            <span>Nova Licitação</span>
          </Link>
        </div>
        )}
      </div>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-400/20 bg-red-950/20 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Não foi possível carregar os dados.</p>
            <p className="mt-1 text-xs text-red-200/75">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-red-300/25 px-3 py-2 text-xs font-semibold hover:border-red-200"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Summary stats bar for filtered results */}
      <div className="metric-strip metric-strip-3 grid grid-cols-1 md:grid-cols-3">
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Ganho (Filtrado)</p>
          <p className="money-value text-lg font-bold text-slate-200 mt-0.5">{formatCurrency(filteredTotals.won)}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Empenhado (Filtrado)</p>
          <p className="money-value text-lg font-bold text-amber-300 mt-0.5">{formatCurrency(filteredTotals.committed)}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Saldo Total Restante</p>
          <p className="money-value text-lg font-bold text-emerald-400 mt-0.5">{formatCurrency(filteredTotals.remaining)}</p>
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      <div className="glass-panel flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-400">
            <Filter size={14} className="text-amber-300" />
            <span>Filtrar licitações</span>
          </div>
          {(searchQuery || filterYear !== 'todos' || filterOrgao !== 'todos' || filterCodigoOrgao || filterCarteira !== 'todos' || filterStatus !== 'todos' || filterVencimento !== 'todos' || sortOrder !== 'padrao') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterYear('todos');
                setFilterOrgao('todos');
                setFilterCodigoOrgao('');
                setFilterCarteira('todos');
                setFilterStatus('todos');
                setFilterVencimento('todos');
                setSortOrder('padrao');
                setCurrentPage(1);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 transition-colors hover:text-amber-100"
            >
              <RotateCcw size={13} />
              Limpar
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 border-y border-stone-900/8 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Bookmark size={14} className="shrink-0 text-amber-700" />
            <select
              value={selectedViewId}
              onChange={(event) => applySavedView(event.target.value)}
              className="form-input min-w-0 flex-1 py-2 text-xs"
              aria-label="Visões salvas"
            >
              <option value="">Visões salvas</option>
              {savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
            </select>
            {selectedViewId && (
              <button
                type="button"
                onClick={deleteSelectedView}
                className="rounded-lg border border-stone-200 bg-white p-2 text-stone-500 hover:border-red-200 hover:text-red-600"
                aria-label="Excluir visão salva"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {savingView ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-md">
              <input
                autoFocus
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveCurrentView();
                  if (event.key === 'Escape') setSavingView(false);
                }}
                maxLength={60}
                className="form-input min-w-0 flex-1 py-2 text-xs"
                placeholder="Nome da visão, ex.: Carteira 4104"
              />
              <button type="button" onClick={saveCurrentView} disabled={!viewName.trim()} className="brand-button rounded-lg p-2 disabled:opacity-40" aria-label="Salvar visão">
                <Save size={14} />
              </button>
              <button type="button" onClick={() => setSavingView(false)} className="rounded-lg border border-stone-200 bg-white p-2 text-stone-500" aria-label="Cancelar">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSavingView(true)}
              className="brand-secondary inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"
            >
              <Save size={14} />
              Salvar filtros atuais
            </button>
          )}
        </div>

        <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(240px,1.8fr)_minmax(130px,0.8fr)_minmax(220px,1.4fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(160px,1fr)_minmax(190px,1.15fr)]">
          {/* Text Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Buscar pregão, processo, órgão, produto..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="form-input py-1.5 pl-9 text-xs w-full bg-slate-900 border-slate-800"
            />
          </div>

          {/* Year select */}
          <select
            value={filterYear}
            onChange={(e) => {
              setFilterYear(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
          >
            <option value="todos">Todos os anos</option>
            {filterOptions.years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Organ select */}
          <select
            value={filterOrgao}
            onChange={(e) => {
              setFilterOrgao(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
          >
            <option value="todos">Todos os Órgãos</option>
            {filterOptions.organs.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          {/* Organ code */}
          <input
            type="text"
            placeholder="Código do órgão"
            value={filterCodigoOrgao}
            onChange={(e) => {
              setFilterCodigoOrgao(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
          />

          <select
            value={filterCarteira}
            onChange={(e) => {
              setFilterCarteira(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
          >
            <option value="todos">Todas carteiras</option>
            {filterOptions.carteiras.map((carteira) => (
              <option key={carteira} value={carteira}>{carteira}</option>
            ))}
          </select>

          {/* Status select */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
          >
            <option value="todos">Todos os Status</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="ganha">Ganha</option>
            <option value="perdida">Perdida</option>
            <option value="parcial">Parcial</option>
            <option value="cancelada">Cancelada</option>
          </select>

          <select
            value={filterVencimento}
            onChange={(e) => {
              setFilterVencimento(e.target.value as VencimentoFilter);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
            aria-label="Filtrar vencimento"
          >
            <option value="todos">Todos vencimentos</option>
            <option value="vigentes">Sem vencidos</option>
            <option value="vencidos">Somente vencidos</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as SortOrder);
              setCurrentPage(1);
            }}
            className="form-input py-1.5 text-xs bg-slate-900 border-slate-800"
            aria-label="Ordenar pregões"
          >
            <option value="padrao">Ordem atual</option>
            <option value="abertura_desc">Data de abertura: mais recente</option>
            <option value="abertura_asc">Data de abertura: mais antiga</option>
            <option value="maior_saldo">Maior saldo disponível</option>
            <option value="menor_saldo">Menor saldo disponível</option>
            <option value="sem_pedidos">Sem pedidos primeiro</option>
            <option value="maior_empenhado">Maior valor empenhado</option>
          </select>
        </div>
      </div>

      {/* Main List Table */}
      <div className="glass-card overflow-hidden border-slate-800">
        {filteredSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Inbox size={48} className="text-slate-700 mb-3" />
            <p className="text-sm">Nenhuma licitação encontrada com os filtros selecionados.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterYear('todos');
                setFilterOrgao('todos');
                setFilterCodigoOrgao('');
                setFilterCarteira('todos');
                setFilterStatus('todos');
                setFilterVencimento('todos');
                setSortOrder('padrao');
                setCurrentPage(1);
              }}
              className="mt-4 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <>
          <div className="divide-y divide-stone-900/8 xl:hidden">
            {paginatedSummaries.map((summary) => {
              const lic = licitacoesById.get(summary.licitacaoId);
              const vencimentoInfo = getVencimentoInfo(lic?.data_vencimento);
              const isHalexImport = (lic?.observacoes || '').startsWith('Importado do Power BI Halex.');

              return (
                <article key={summary.licitacaoId} className="space-y-4 p-4 transition-colors hover:bg-amber-50/35 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-stone-900">Pregão {summary.numeroPregao}</p>
                        {isHalexImport && (
                          <span className="rounded-full border border-amber-500/20 bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                            Halex
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] font-medium text-stone-500">
                        {summary.ano} · Processo {lic?.numero_processo || 'não informado'}
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-amber-700">
                        Abertura: {lic?.data_abertura ? formatAppDate(lic.data_abertura) : 'não informada'}
                      </p>
                    </div>
                    <StatusBadge status={summary.status as LicitacaoStatus} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold leading-snug text-stone-800">{summary.orgao}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                      {[lic?.carteira_regiao && `Carteira ${lic.carteira_regiao}`, lic?.cidade, lic?.estado]
                        .filter(Boolean)
                        .join(' · ') || 'Região não informada'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 border-y border-stone-900/8 py-3">
                    <div className="pr-2">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Ganho</p>
                      <p className="mt-1 text-[11px] font-bold text-stone-800">{formatCurrency(summary.valorTotalGanho)}</p>
                    </div>
                    <div className="border-l border-stone-900/8 px-2">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-amber-700/70">Empenhado</p>
                      <p className="mt-1 text-[11px] font-bold text-amber-800">{formatCurrency(summary.valorTotalEmpenhado)}</p>
                    </div>
                    <div className="border-l border-stone-900/8 pl-2">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-700/70">Saldo</p>
                      <p className="mt-1 text-[11px] font-bold text-emerald-700">{formatCurrency(summary.saldoRestante)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className={`rounded-full border px-2 py-1 text-[9px] font-bold ${getVencimentoClasses(vencimentoInfo.status)}`}>
                      {lic?.data_vencimento ? `${formatVencimentoDate(lic.data_vencimento)} · ${vencimentoInfo.label}` : vencimentoInfo.label}
                    </p>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/licitacoes/${summary.licitacaoId}`}
                        aria-label={`Ver detalhes do pregão ${summary.numeroPregao}`}
                        className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600"
                      >
                        <Eye size={15} />
                      </Link>
                      {isAdmin && summary.valorTotalGanho > 0 && summary.saldoRestante > 0 && (
                        <Link
                          href={`/dashboard/empenhos/novo?licitacaoId=${summary.licitacaoId}`}
                          aria-label={`Lançar empenho para o pregão ${summary.numeroPregao}`}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700"
                        >
                          <Coins size={15} />
                        </Link>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDuplicate(summary.licitacaoId, summary.numeroPregao)}
                          aria-label={`Duplicar pregão ${summary.numeroPregao}`}
                          className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600"
                        >
                          <Copy size={15} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(summary.licitacaoId, summary.numeroPregao)}
                          aria-label={`Excluir pregão ${summary.numeroPregao}`}
                          className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="data-table min-w-[1040px] w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/40">
                  <th className="w-40 px-3 py-3">Pregão / Processo</th>
                  <th className="min-w-[15rem] px-3 py-3">Órgão / Responsável</th>
                  <th className="w-40 px-3 py-3">Status / Datas</th>
                  <th className="min-w-[7.5rem] px-3 py-3">Ganho</th>
                  <th className="min-w-[7.5rem] px-3 py-3">Empenhado</th>
                  <th className="min-w-[7.5rem] px-3 py-3">Saldo</th>
                  <th className="sticky right-0 z-10 w-40 border-l border-stone-200 bg-[#f7f3eb] px-3 py-3 text-center shadow-[-12px_0_24px_-22px_rgba(66,47,22,0.7)]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {paginatedSummaries.map((summary) => {
                  const lic = licitacoesById.get(summary.licitacaoId);
                  const vencimentoInfo = getVencimentoInfo(lic?.data_vencimento);
                  const isHalexImport = (lic?.observacoes || '').startsWith('Importado do Power BI Halex.');

                  return (
                  <tr key={summary.licitacaoId} className="hover:bg-slate-900/20 transition-colors group">
                    <td className="px-3 py-4">
                      <p className="font-bold text-slate-200 group-hover:text-amber-300 transition-colors">
                        {summary.numeroPregao}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {summary.ano} · Processo {lic?.numero_processo || 'não informado'}
                      </p>
                      {isHalexImport && (
                        <span className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                          Halex
                        </span>
                      )}
                    </td>
                    <td className="min-w-[15rem] px-3 py-4">
                      <p className="readable-name font-semibold leading-relaxed text-slate-300">{summary.orgao}</p>
                      {lic?.codigo_cliente && (
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Código: {lic.codigo_cliente}</p>
                      )}
                      {(lic?.carteira_regiao || lic?.cidade || lic?.estado) && (
                        <p className="readable-name text-[10px] text-slate-500 mt-0.5 font-mono leading-relaxed">
                          {lic.carteira_regiao ? `Carteira: ${lic.carteira_regiao}` : ''}
                          {lic.carteira_regiao && (lic.cidade || lic.estado) ? ' • ' : ''}
                          {[lic.cidade, lic.estado].filter(Boolean).join('/')}
                        </p>
                      )}
                      {(lic?.orgao_contato || lic?.orgao_telefone) && (
                        <p className="readable-name text-[10px] text-slate-500 mt-0.5 font-mono leading-relaxed">
                          {lic.orgao_contato || 'Contato'}{lic.orgao_telefone ? ` • ${lic.orgao_telefone}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={summary.status as LicitacaoStatus} />
                      <div className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                        Abertura: {lic?.data_abertura ? formatAppDate(lic.data_abertura) : 'não informada'}
                      </div>
                      {(lic?.data_vencimento || vencimentoInfo.status !== 'sem_data') && (
                        <div className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getVencimentoClasses(vencimentoInfo.status)}`}>
                          {lic?.data_vencimento ? `${formatVencimentoDate(lic.data_vencimento)} • ${vencimentoInfo.label}` : vencimentoInfo.label}
                        </div>
                      )}
                    </td>
                    <td className="min-w-[7.5rem] px-3 py-4 font-mono font-bold text-slate-300">
                      {formatCurrency(summary.valorTotalGanho)}
                    </td>
                    <td className="min-w-[7.5rem] px-3 py-4 font-mono font-bold text-amber-300">
                      {formatCurrency(summary.valorTotalEmpenhado)}
                    </td>
                    <td className="min-w-[7.5rem] px-3 py-4 font-mono font-bold text-emerald-400">
                      {formatCurrency(summary.saldoRestante)}
                    </td>
                    <td className="sticky right-0 border-l border-stone-100 bg-white px-3 py-4 shadow-[-12px_0_24px_-22px_rgba(66,47,22,0.7)] transition-colors group-hover:bg-[#fbf7ef]">
                      <div className="flex items-center justify-center gap-2">
                        {/* Ver Detalhes */}
                        <Link
                          href={`/dashboard/licitacoes/${summary.licitacaoId}`}
                          aria-label={`Ver detalhes do pregão ${summary.numeroPregao}`}
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/80 hover:text-amber-300 hover:border-amber-300/30 transition-all"
                        >
                          <Eye size={14} />
                        </Link>

                        {/* Lançar Empenho */}
                        {isAdmin && summary.valorTotalGanho > 0 && summary.saldoRestante > 0 && (
                          <Link
                            href={`/dashboard/empenhos/novo?licitacaoId=${summary.licitacaoId}`}
                            aria-label={`Lançar empenho para o pregão ${summary.numeroPregao}`}
                            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/80 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                          >
                            <Coins size={14} />
                          </Link>
                        )}

                        {/* Duplicar Licitação */}
                        {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDuplicate(summary.licitacaoId, summary.numeroPregao)}
                          aria-label={`Duplicar pregão ${summary.numeroPregao}`}
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/80 hover:text-stone-200 hover:border-amber-300/30 transition-all cursor-pointer"
                        >
                          <Copy size={14} />
                        </button>
                        )}

                        {/* Excluir Licitação */}
                        {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(summary.licitacaoId, summary.numeroPregao)}
                          aria-label={`Excluir pregão ${summary.numeroPregao}`}
                          className="p-1.5 rounded bg-slate-900 hover:bg-red-950/20 text-slate-400 border border-slate-800/80 hover:text-red-400 hover:border-red-900/30 transition-all cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        {filteredSummaries.length > pageSize && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-900/8 px-4 py-3 text-xs text-stone-500 sm:flex-row">
            <p>
              Exibindo {(effectivePage - 1) * pageSize + 1}–{Math.min(effectivePage * pageSize, filteredSummaries.length)} de {filteredSummaries.length}
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
      </div>
    </div>
  );
}
