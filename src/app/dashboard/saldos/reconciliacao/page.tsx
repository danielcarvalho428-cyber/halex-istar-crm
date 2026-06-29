'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Search,
} from 'lucide-react';
import { db, type AppDataBundle } from '@/lib/db';
import { calculateLicitacaoSummary } from '@/lib/saldo';
import { formatAppDate } from '@/lib/date';
import { getVencimentoInfo } from '@/lib/vencimento';
import type { Licitacao, LicitacaoItem } from '@/types';

type Severity = 'alta' | 'media' | 'baixa';
type IssueKind = 'vencido_com_saldo' | 'saldo_alto' | 'sem_pedidos' | 'produto_duplicado';

type ReconciliationIssue = {
  id: string;
  kind: IssueKind;
  severity: Severity;
  title: string;
  description: string;
  licitacao: Licitacao;
  item?: LicitacaoItem;
  saldoFinanceiro: number;
  saldoQuantidade: number;
};

const severityRank: Record<Severity, number> = { alta: 0, media: 1, baixa: 2 };
const kindLabels: Record<IssueKind | 'todos', string> = {
  todos: 'Todos',
  vencido_com_saldo: 'Vencidos com saldo',
  saldo_alto: 'Saldo alto',
  sem_pedidos: 'Sem pedidos',
  produto_duplicado: 'Produto duplicado',
};

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function normalizeProduct(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

function severityClasses(severity: Severity) {
  switch (severity) {
    case 'alta':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'media':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-stone-200 bg-stone-50 text-stone-700';
  }
}

export default function ReconciliacaoSaldosPage() {
  const [data, setData] = useState<AppDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<IssueKind | 'todos'>('todos');

  useEffect(() => {
    db.getAppData()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os saldos.'))
      .finally(() => setLoading(false));
  }, []);

  const issues = useMemo(() => {
    if (!data) return [];

    const itemsByLicitacao = new Map<string, LicitacaoItem[]>();
    for (const item of data.itens) {
      itemsByLicitacao.set(item.licitacao_id, [...(itemsByLicitacao.get(item.licitacao_id) || []), item]);
    }

    const next: ReconciliationIssue[] = [];
    for (const licitacao of data.licitacoes) {
      const items = itemsByLicitacao.get(licitacao.id) || [];
      const summary = calculateLicitacaoSummary(licitacao, items, data.empenhos, data.empenhoItens);
      const vencimento = getVencimentoInfo(licitacao.data_vencimento);
      const wonItems = items.filter((item) => item.status === 'ganho');

      if (vencimento.status === 'vencido' && summary.saldoRestante > 0) {
        next.push({
          id: `expired-${licitacao.id}`,
          kind: 'vencido_com_saldo',
          severity: 'alta',
          title: `Contrato vencido com saldo real: Pregao ${licitacao.numero_pregao}`,
          description: `${licitacao.orgao} venceu em ${formatAppDate(licitacao.data_vencimento) || 'data nao informada'}. Use para reconciliar saldos, nao para novo pedido fora da vigencia.`,
          licitacao,
          saldoFinanceiro: summary.saldoRestante,
          saldoQuantidade: summary.itemSaldos.reduce((sum, item) => sum + item.saldoQuantidade, 0),
        });
      }

      if (summary.saldoRestante >= 10000 && vencimento.status !== 'vencido') {
        next.push({
          id: `high-${licitacao.id}`,
          kind: 'saldo_alto',
          severity: 'media',
          title: `Saldo alto disponivel: Pregao ${licitacao.numero_pregao}`,
          description: `${licitacao.orgao} ainda possui saldo relevante em contrato vigente.`,
          licitacao,
          saldoFinanceiro: summary.saldoRestante,
          saldoQuantidade: summary.itemSaldos.reduce((sum, item) => sum + item.saldoQuantidade, 0),
        });
      }

      if (wonItems.length > 0 && summary.empenhosAtivosCount === 0) {
        next.push({
          id: `no-orders-${licitacao.id}`,
          kind: 'sem_pedidos',
          severity: vencimento.status === 'vencido' ? 'media' : 'alta',
          title: `Itens ganhos sem empenho: Pregao ${licitacao.numero_pregao}`,
          description: `${wonItems.length} item(ns) ganho(s), mas nenhum empenho ativo registrado.`,
          licitacao,
          saldoFinanceiro: summary.saldoRestante,
          saldoQuantidade: summary.itemSaldos.reduce((sum, item) => sum + item.saldoQuantidade, 0),
        });
      }

      const productGroups = new Map<string, LicitacaoItem[]>();
      for (const item of wonItems) {
        const key = normalizeProduct(item.codigo_produto || item.descricao);
        if (!key) continue;
        productGroups.set(key, [...(productGroups.get(key) || []), item]);
      }
      for (const groupItems of productGroups.values()) {
        if (groupItems.length < 2) continue;
        const saldoGroup = summary.itemSaldos.filter((saldo) => groupItems.some((item) => item.id === saldo.itemId));
        const saldoFinanceiro = saldoGroup.reduce((sum, saldo) => sum + saldo.saldoFinanceiro, 0);
        if (saldoFinanceiro <= 0) continue;
        next.push({
          id: `dup-${licitacao.id}-${groupItems.map((item) => item.id).join('-')}`,
          kind: 'produto_duplicado',
          severity: 'media',
          title: `Produto ganho em itens repetidos: Pregao ${licitacao.numero_pregao}`,
          description: `Itens ${groupItems.map((item) => `#${item.numero_item}`).join(', ')} parecem representar o mesmo produto. Confira distribuicao de saldo.`,
          licitacao,
          item: groupItems[0],
          saldoFinanceiro,
          saldoQuantidade: saldoGroup.reduce((sum, saldo) => sum + saldo.saldoQuantidade, 0),
        });
      }
    }

    return next.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.saldoFinanceiro - a.saldoFinanceiro);
  }, [data]);

  const filteredIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (kind !== 'todos' && issue.kind !== kind) return false;
      if (!needle) return true;
      return [
        issue.title,
        issue.description,
        issue.licitacao.orgao,
        issue.licitacao.numero_pregao,
        issue.licitacao.codigo_cliente,
        issue.item?.descricao,
        issue.item?.codigo_produto,
      ].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [issues, kind, query]);

  const totals = useMemo(() => ({
    high: issues.filter((issue) => issue.severity === 'alta').length,
    expiredBalance: issues.filter((issue) => issue.kind === 'vencido_com_saldo').reduce((sum, issue) => sum + issue.saldoFinanceiro, 0),
    totalBalance: issues.reduce((sum, issue) => sum + issue.saldoFinanceiro, 0),
  }), [issues]);

  if (loading) {
    return <div className="py-20 text-center text-sm text-stone-500">Montando fila de reconciliacao...</div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="page-hero flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="lumina-kicker">Operacao</p>
          <h1 className="mt-2 text-3xl font-semibold">Reconciliacao de saldos</h1>
          <p className="mt-2 max-w-3xl text-sm text-stone-500">
            Fila operacional para encontrar saldos vencidos, saldos altos, itens ganhos sem pedidos e produtos duplicados.
          </p>
        </div>
        <Link href="/dashboard/licitacoes" className="brand-secondary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
          Licitacoes
          <ExternalLink size={15} />
        </Link>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <section className="metric-strip grid grid-cols-1 md:grid-cols-3">
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Alertas altos</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{totals.high}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Saldo em vencidos</p>
          <p className="money-value mt-1 text-2xl font-semibold text-amber-800">{money(totals.expiredBalance)}</p>
        </div>
        <div className="metric-item p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Saldo na fila</p>
          <p className="money-value mt-1 text-2xl font-semibold text-stone-900">{money(totals.totalBalance)}</p>
        </div>
      </section>

      <section className="glass-panel grid gap-3 p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="form-input w-full pl-9 text-sm"
            placeholder="Buscar pregao, cliente, orgao ou produto..."
          />
        </div>
        <select value={kind} onChange={(event) => setKind(event.target.value as IssueKind | 'todos')} className="form-input text-sm">
          {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-900/8 p-4">
          <ClipboardCheck size={17} className="text-amber-700" />
          <h2 className="font-semibold">Pendencias de saldo</h2>
          <span className="ml-auto rounded-full border border-stone-200 px-2 py-1 text-xs font-bold text-stone-600">{filteredIssues.length}</span>
        </div>
        {filteredIssues.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" />
            <p className="mt-3 text-sm font-semibold">Nada encontrado para os filtros atuais.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-900/8">
            {filteredIssues.map((issue) => (
              <article key={issue.id} className="grid gap-4 p-4 xl:grid-cols-[1fr_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityClasses(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-600">
                      {kindLabels[issue.kind]}
                    </span>
                    <p className="text-sm font-semibold text-stone-900">{issue.title}</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-stone-500">{issue.description}</p>
                  <p className="mt-2 text-[11px] text-stone-500">
                    Codigo {issue.licitacao.codigo_cliente || '-'} - Abertura {formatAppDate(issue.licitacao.data_abertura) || '-'} - Vencimento {formatAppDate(issue.licitacao.data_vencimento) || '-'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
                  <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-right">
                    <p className="text-[9px] font-bold uppercase text-stone-500">Saldo</p>
                    <p className="money-value mt-1 text-sm font-bold text-stone-900">{money(issue.saldoFinanceiro)}</p>
                  </div>
                  <Link href={`/dashboard/licitacoes/${issue.licitacao.id}`} className="brand-button inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold">
                    Abrir
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
