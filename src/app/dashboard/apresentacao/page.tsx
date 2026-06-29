'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Eye,
  EyeOff,
  Maximize2,
  MapPinned,
  Printer,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { db } from '@/lib/db';
import { buildCommercialComparison } from '@/lib/commercial-comparison';
import { buildPurchaseTrends } from '@/lib/purchase-trends';
import { calculateDashboardStats } from '@/lib/saldo';
import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '@/types';
import CompanyFooter from '@/components/CompanyFooter';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value?: string | null) {
  if (!value) return 'Sem estimativa';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function anonymousName(index: number) {
  return `Cliente estratégico ${String(index + 1).padStart(2, '0')}`;
}

export default function PresentationPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [items, setItems] = useState<LicitacaoItem[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [empenhoItems, setEmpenhoItems] = useState<EmpenhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await db.getAppData();
        if (!active) return;
        setLicitacoes(data.licitacoes);
        setItems(data.itens);
        setEmpenhos(data.empenhos);
        setEmpenhoItems(data.empenhoItens);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Não foi possível montar a apresentação.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  };

  const stats = useMemo(
    () => calculateDashboardStats(licitacoes, items, empenhos, empenhoItems),
    [empenhoItems, empenhos, items, licitacoes]
  );
  const comparison = useMemo(
    () => buildCommercialComparison(licitacoes, items, empenhos, empenhoItems),
    [empenhoItems, empenhos, items, licitacoes]
  );
  const trends = useMemo(() => buildPurchaseTrends(licitacoes, empenhos), [empenhos, licitacoes]);
  const totals = useMemo(
    () => comparison.clients.reduce(
      (result, client) => ({
        won2025: result.won2025 + client.metrics2025.won,
        sold2025: result.sold2025 + client.metrics2025.sold,
        won2026: result.won2026 + client.metrics2026.won,
        sold2026: result.sold2026 + client.metrics2026.sold,
        recovery: result.recovery + client.recoveryOpportunity,
      }),
      { won2025: 0, sold2025: 0, won2026: 0, sold2026: 0, recovery: 0 }
    ),
    [comparison.clients]
  );
  const urgent = useMemo(
    () => trends.filter((trend) => trend.priority === 'atrasado' || trend.priority === 'agora'),
    [trends]
  );
  const topClients = useMemo(
    () => comparison.clients.filter((client) => client.recoveryOpportunity > 0).slice(0, 6),
    [comparison.clients]
  );
  const latestUpdate = useMemo(
    () => licitacoes.map((item) => item.updated_at).filter(Boolean).sort().at(-1) || null,
    [licitacoes]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf0] text-sm text-stone-500">
        Preparando apresentação executiva...
      </div>
    );
  }

  return (
    <div className="presentation-shell min-h-screen bg-[#fffaf0] text-stone-950">
      <header className="presentation-toolbar sticky top-0 z-30 border-b border-stone-900/10 bg-[#fffaf0]/95 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-lg text-sm font-black">LL</div>
            <div>
              <p className="font-semibold">Licita Lumina</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Apresentação executiva</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPrivacy((value) => !value)}
              className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"
              aria-pressed={privacy}
            >
              {privacy ? <Eye size={15} /> : <EyeOff size={15} />}
              {privacy ? 'Mostrar clientes' : 'Ocultar clientes'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"
            >
              <Printer size={15} />
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"
              aria-pressed={fullscreen}
            >
              <Maximize2 size={15} />
              {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            </button>
            <Link href="/dashboard" className="brand-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold">
              <ArrowLeft size={15} />
              Voltar ao painel
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-12 px-4 py-8 sm:px-8 lg:py-12">
        <section className="presentation-hero relative grid gap-8 overflow-hidden border-b border-stone-900/10 pb-10 lg:min-h-[420px] lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <p className="lumina-kicker">Halex Istar · Inteligência comercial</p>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              Da gestão do saldo à recuperação de clientes.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg">
              Visão consolidada dos pregões importados, vendas realizadas, oportunidades de recuperação e próximos contatos comerciais.
            </p>
          </div>
          <div className="border-l-2 border-amber-500 pl-5 text-sm text-stone-600">
            <div className="flex items-center gap-2 font-semibold text-stone-900">
              <ShieldCheck size={17} className="text-amber-700" />
              Dados reais do ambiente
            </div>
            <p className="mt-2">{licitacoes.length} pregões analisados.</p>
            {latestUpdate && (
              <p className="mt-1">
                Atualizado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(latestUpdate))}.
              </p>
            )}
          </div>
        </section>

        {error && <div role="alert" className="border-l-2 border-red-600 py-2 pl-4 text-sm text-red-700">{error}</div>}

        <section aria-labelledby="resumo-title">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="lumina-kicker">01 · Situação atual</p>
              <h2 id="resumo-title" className="mt-2 text-2xl font-semibold sm:text-3xl">Resumo da operação</h2>
            </div>
          </div>
          <div className="metric-strip grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Valor ganho', money(stats.totalWon), TrendingUp],
              ['Valor empenhado', money(stats.totalCommitted), Building2],
              ['Saldo disponível', money(stats.totalRemaining), TrendingDown],
              ['Pregões ativos', stats.activeLicitacoesCount.toLocaleString('pt-BR'), Target],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="metric-item p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{String(label)}</p>
                    <p className="money-value mt-3 text-2xl font-semibold">{String(value)}</p>
                  </div>
                  <Icon className="text-amber-700" size={20} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="comparacao-title" className="editorial-section px-5 py-7 sm:px-8">
          <div className="grid gap-8 xl:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="lumina-kicker">02 · Comparativo anual</p>
              <h2 id="comparacao-title" className="mt-2 text-2xl font-semibold sm:text-3xl">2025 × 2026</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
                O sistema cruza os mesmos clientes e produtos para identificar perda de carteira e estimar o valor recuperável.
              </p>
              <div className="mt-7 border-l-2 border-amber-500 pl-5">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Potencial de recuperação</p>
                <p className="money-value mt-2 text-3xl font-semibold text-amber-800">{money(totals.recovery)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 border-y border-stone-900/10">
              {[
                ['Ganho 2025', totals.won2025],
                ['Vendido 2025', totals.sold2025],
                ['Ganho 2026', totals.won2026],
                ['Vendido 2026', totals.sold2026],
              ].map(([label, value], index) => (
                <div key={String(label)} className={`p-5 ${index % 2 ? 'border-l border-stone-900/10' : ''} ${index > 1 ? 'border-t border-stone-900/10' : ''}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{String(label)}</p>
                  <p className={`money-value mt-2 text-xl font-semibold ${String(label).includes('Vendido') ? 'text-emerald-700' : ''}`}>
                    {money(Number(value))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="regioes-title">
          <p className="lumina-kicker">03 · Onde agir</p>
          <h2 id="regioes-title" className="mt-2 text-2xl font-semibold sm:text-3xl">Recuperação por região</h2>
          <div className="mt-6 grid border-y border-stone-900/10 lg:grid-cols-3">
            {comparison.regions.slice(0, 3).map((region, index) => (
              <article key={region.region} className={`py-6 lg:px-6 ${index ? 'border-t border-stone-900/10 lg:border-l lg:border-t-0' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">Região {region.region}</p>
                    <p className="mt-1 text-xs text-stone-500">{region.clientsAtRisk} clientes com oportunidade</p>
                  </div>
                  <MapPinned size={18} className="text-amber-700" />
                </div>
                <p className="money-value mt-5 text-2xl font-semibold text-amber-800">{money(region.recoveryOpportunity)}</p>
                <p className="mt-2 text-xs text-stone-500">
                  {money(region.metrics2026.won - region.metrics2025.won)} de variação no ganho
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-10 xl:grid-cols-[1.08fr_0.92fr]">
          <div aria-labelledby="clientes-title">
            <p className="lumina-kicker">04 · Prioridades comerciais</p>
            <h2 id="clientes-title" className="mt-2 text-2xl font-semibold sm:text-3xl">Maiores oportunidades</h2>
            <div className="mt-5 divide-y divide-stone-900/10 border-y border-stone-900/10">
              {topClients.map((client, index) => (
                <div key={client.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold">{privacy ? anonymousName(index) : client.client}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Região {client.region} · Retenção {client.retentionPercent === null ? 'sem base' : `${Math.round(client.retentionPercent)}%`}
                    </p>
                  </div>
                  <p className="money-value text-sm font-bold text-amber-800">{money(client.recoveryOpportunity)}</p>
                </div>
              ))}
            </div>
          </div>

          <div aria-labelledby="contatos-title">
            <p className="lumina-kicker">05 · Próxima ação</p>
            <h2 id="contatos-title" className="mt-2 text-2xl font-semibold sm:text-3xl">Contatos prioritários</h2>
            <div className="mt-5 divide-y divide-stone-900/10 border-y border-stone-900/10">
              {urgent.slice(0, 6).map((trend, index) => (
                <div key={trend.clientKey} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold">{privacy ? anonymousName(index) : trend.client}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {trend.priority === 'atrasado' ? 'Contato atrasado' : 'Ligar agora'} · {trend.region}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <CalendarClock size={14} />
                    {date(trend.predictedDate)}
                  </div>
                </div>
              ))}
              {urgent.length === 0 && <p className="py-5 text-sm text-stone-500">Nenhum contato urgente no momento.</p>}
            </div>
          </div>
        </section>

        <CompanyFooter
          endContent={(
            <span>
              Relatório gerado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}
            </span>
          )}
        />
      </main>
    </div>
  );
}
