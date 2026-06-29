'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, DatabaseZap } from 'lucide-react';
import CommercialNav from '@/components/CommercialNav';
import { db } from '@/lib/db';
import { normalizeCommercialClient } from '@/lib/purchase-trends';
import type { Licitacao } from '@/types';

type Issue = {
  id: string;
  severity: 'alta' | 'media' | 'baixa';
  title: string;
  description: string;
  licitacaoId?: string;
};

export default function DataQualityPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void db.getLicitacoes().then(setLicitacoes).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const issues = useMemo(() => {
    const result: Issue[] = [];
    const codeNames = new Map<string, string>();
    const nameCodes = new Map<string, Set<string>>();

    licitacoes.forEach((lic) => {
      const normalized = normalizeCommercialClient(lic.orgao);
      if (!lic.codigo_cliente) result.push({ id: `code-${lic.id}`, severity: 'alta', title: 'Cliente sem código', description: lic.orgao, licitacaoId: lic.id });
      if (!lic.orgao_telefone && !lic.orgao_email) result.push({ id: `contact-${lic.id}`, severity: 'media', title: 'Sem telefone e e-mail', description: lic.orgao, licitacaoId: lic.id });
      if (!lic.carteira_regiao) result.push({ id: `region-${lic.id}`, severity: 'media', title: 'Carteira/região ausente', description: lic.orgao, licitacaoId: lic.id });
      if (!lic.estado) result.push({ id: `state-${lic.id}`, severity: 'baixa', title: 'Estado ausente', description: lic.orgao, licitacaoId: lic.id });

      if (lic.codigo_cliente) {
        const prior = codeNames.get(lic.codigo_cliente);
        if (prior && normalizeCommercialClient(prior) !== normalized) {
          result.push({
            id: `code-name-${lic.id}`,
            severity: 'alta',
            title: 'Mesmo código com nomes diferentes',
            description: `${lic.codigo_cliente}: ${prior} / ${lic.orgao}`,
            licitacaoId: lic.id,
          });
        }
        codeNames.set(lic.codigo_cliente, lic.orgao);
        const codes = nameCodes.get(normalized) || new Set<string>();
        codes.add(lic.codigo_cliente);
        nameCodes.set(normalized, codes);
      }
    });

    nameCodes.forEach((codes, name) => {
      if (codes.size > 1) {
        result.push({
          id: `duplicate-${name}`,
          severity: 'alta',
          title: 'Possível cliente duplicado',
          description: `Mesmo nome associado aos códigos ${[...codes].join(', ')}`,
        });
      }
    });

    const rank = { alta: 0, media: 1, baixa: 2 };
    return result.sort((left, right) => rank[left.severity] - rank[right.severity]);
  }, [licitacoes]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(issues.length / pageSize));
  const effectivePage = Math.min(currentPage, pageCount);
  const visibleIssues = issues.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Auditando dados...</div>;

  const complete = licitacoes.length
    ? Math.max(0, Math.round((1 - issues.length / (licitacoes.length * 4)) * 100))
    : 100;

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">CRM Comercial</p>
        <h1 className="mt-2 text-3xl font-semibold">Qualidade dos dados</h1>
        <p className="mt-2 text-sm text-stone-500">
          Encontre duplicidades e lacunas que reduzem a precisão das análises e do contato comercial.
        </p>
      </header>

      <CommercialNav />

      <section className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Completude</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{complete}%</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Problemas críticos</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{issues.filter((issue) => issue.severity === 'alta').length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] font-bold uppercase text-stone-500">Total de alertas</p>
          <p className="mt-2 text-2xl font-semibold text-amber-800">{issues.length}</p>
        </div>
      </section>

      {issues.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" />
          <p className="mt-3 font-semibold">Nenhum problema encontrado.</p>
        </div>
      ) : (
        <section className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-stone-900/8 p-4">
            <DatabaseZap size={17} className="text-amber-700" />
            <h2 className="font-semibold">Pendências encontradas</h2>
          </div>
          <div className="divide-y divide-stone-900/8">
            {visibleIssues.map((issue) => (
              <article key={issue.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle size={16} className={issue.severity === 'alta' ? 'text-red-600' : issue.severity === 'media' ? 'text-amber-600' : 'text-stone-500'} />
                  <div>
                    <p className="text-sm font-semibold">{issue.title}</p>
                    <p className="mt-1 text-xs text-stone-500">{issue.description}</p>
                  </div>
                </div>
                {issue.licitacaoId && (
                  <Link href={`/dashboard/licitacoes/${issue.licitacaoId}/editar`} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-center text-xs font-bold text-stone-700">
                    Corrigir cadastro
                  </Link>
                )}
              </article>
            ))}
          </div>
          {issues.length > pageSize && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-stone-900/8 px-4 py-3 text-xs text-stone-500 sm:flex-row">
              <p>Exibindo {(effectivePage - 1) * pageSize + 1}–{Math.min(effectivePage * pageSize, issues.length)} de {issues.length}</p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={effectivePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:opacity-40">Anterior</button>
                <span className="px-2 font-semibold text-stone-700">{effectivePage} / {pageCount}</span>
                <button type="button" disabled={effectivePage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} className="rounded-lg border border-stone-200 bg-white px-3 py-2 font-semibold text-stone-700 disabled:opacity-40">Próxima</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
