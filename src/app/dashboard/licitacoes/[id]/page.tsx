'use client';

import React, { use, useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Plus, 
  Coins, 
  Calendar, 
  FileText, 
  Trash2, 
  Power, 
  PowerOff,
  Inbox, 
  TrendingUp, 
  TrendingDown, 
  Award,
  AlertCircle,
  Pencil
} from 'lucide-react';
import { db } from '../../../../lib/db';
import { calculateLicitacaoSummary } from '../../../../lib/saldo';
import { formatAppDate } from '../../../../lib/date';
import { formatVencimentoDate, getVencimentoClasses, getVencimentoInfo } from '../../../../lib/vencimento';
import { Licitacao, Empenho, EmpenhoItem, EmpenhoStatus } from '../../../../types';
import StatusBadge from '../../../../components/StatusBadge';
import { useSessionRole } from '../../../../lib/useSessionRole';
import { stripCommercialContactMarkers } from '../../../../lib/commercial-contacts';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LicitacaoDetailPage({ params }: PageProps) {
  const { id } = use(params);

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [empenhoItens, setEmpenhoItens] = useState<EmpenhoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deletingAllEmpenhos, setDeletingAllEmpenhos] = useState(false);
  const { isAdmin } = useSessionRole();

  // Load data for this bidding
  const loadData = useCallback(async () => {
    setLoadError('');
    try {
      const detailedLic = await db.getLicitacao(id);
      if (!detailedLic) {
        setLicitacao(null);
        return;
      }
      
      const eData = await db.getEmpenhos(id);
      const eiData = await db.getAllEmpenhoItens();

      setLicitacao(detailedLic);
      setEmpenhos(eData);
      setEmpenhoItens(eiData);
    } catch (err) {
      console.error('Erro ao carregar detalhes da licitação:', err);
      setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar esta licitação.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  // Compute calculated values using our engine
  const summary = useMemo(() => {
    if (!licitacao) return null;
    const items = licitacao.itens || [];
    return calculateLicitacaoSummary(licitacao, items, empenhos, empenhoItens);
  }, [licitacao, empenhos, empenhoItens]);

  // Toggle commitment status (Cancel / Re-activate)
  const handleToggleEmpenhoStatus = async (empenho: Empenho) => {
    const newStatus: EmpenhoStatus = empenho.status === 'cancelado' ? 'ativo' : 'cancelado';
    const actionText = newStatus === 'cancelado' ? 'cancelar' : 'reativar';
    
    if (confirm(`Deseja realmente ${actionText} o empenho Nº ${empenho.numero_empenho}? O saldo dos itens será recalculado.`)) {
      try {
        const detailedEmpenho = await db.getEmpenho(empenho.id);
        if (!detailedEmpenho) return;

        const updatedEmpenho = {
          ...empenho,
          status: newStatus
        };

        const itemsToSend = (detailedEmpenho.itens || []).map(i => ({
          licitacao_item_id: i.licitacao_item_id,
          quantidade_empenhada: i.quantidade_empenhada,
          valor_unitario: i.valor_unitario
        }));

        await db.saveEmpenho(updatedEmpenho, itemsToSend);
        alert(`Empenho ${newStatus === 'cancelado' ? 'cancelado' : 'reativado'} com sucesso.`);
        loadData();
      } catch (err) {
        alert('Erro ao atualizar status do empenho.');
        console.error(err);
      }
    }
  };

  // Delete commitment
  const handleDeleteEmpenho = async (empenhoId: string, number: string) => {
    if (confirm(`Excluir permanentemente o empenho Nº ${number}? Esta ação restabelecerá o saldo de todos os itens.`)) {
      try {
        await db.deleteEmpenho(empenhoId);
        setEmpenhos((current) => current.filter((empenho) => empenho.id !== empenhoId));
        setEmpenhoItens((current) => current.filter((item) => item.empenho_id !== empenhoId));
        alert('Empenho excluído com sucesso.');
        await loadData();
      } catch (err) {
        alert('Erro ao excluir empenho.');
        console.error(err);
      }
    }
  };

  const handleDeleteAllEmpenhos = async () => {
    const count = empenhos.length;
    if (!confirm(
      `Excluir permanentemente todos os ${count} empenho(s) do Pregão ${licitacao?.numero_pregao}? ` +
      'Esta ação não pode ser desfeita e restabelecerá o saldo de todos os itens.'
    )) {
      return;
    }

    setDeletingAllEmpenhos(true);
    try {
      const idsToDelete = new Set(empenhos.map((empenho) => empenho.id));
      const deletedCount = await db.deleteEmpenhosByLicitacao(id);
      setEmpenhos((current) => current.filter((empenho) => !idsToDelete.has(empenho.id)));
      setEmpenhoItens((current) => current.filter((item) => !idsToDelete.has(item.empenho_id)));
      alert(`${deletedCount} empenho(s) excluído(s) com sucesso.`);
      await loadData();
    } catch (err) {
      alert('Erro ao excluir todos os empenhos.');
      console.error(err);
    } finally {
      setDeletingAllEmpenhos(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const vencimentoInfo = getVencimentoInfo(licitacao?.data_vencimento);
  const wonItemSaldos = summary?.itemSaldos.filter((item) => item.status === 'ganho') || [];
  const otherItemSaldos = summary?.itemSaldos.filter((item) => item.status !== 'ganho') || [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Carregando workstation do contrato...</p>
      </div>
    );
  }

  if (!licitacao || !summary) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-500 mx-auto mb-4 animate-bounce" />
        <h3 className="text-xl font-bold text-slate-200">
          {loadError ? 'Não foi possível carregar a licitação' : 'Licitação não encontrada'}
        </h3>
        <p className="text-slate-400 mt-1 text-sm">
          {loadError || 'O registro selecionado pode ter sido removido ou não existe.'}
        </p>
        {loadError && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadData();
            }}
            className="mt-5 rounded-lg border border-red-400/25 bg-red-950/20 px-4 py-2 text-xs font-semibold text-red-200"
          >
            Tentar novamente
          </button>
        )}
        <Link
          href="/dashboard/licitacoes"
          className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-xs"
        >
          <ArrowLeft size={14} />
          <span>Voltar para Licitações</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/licitacoes"
            className="p-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-50">Pregão {licitacao.numero_pregao}</h1>
              <StatusBadge status={licitacao.status} />
            </div>
            <p className="readable-name text-slate-400 text-xs mt-1 font-semibold leading-relaxed">
              {licitacao.orgao}
              {licitacao.codigo_cliente ? ` • Código: ${licitacao.codigo_cliente}` : ''}
              {licitacao.carteira_regiao ? ` • Carteira: ${licitacao.carteira_regiao}` : ''}
              {licitacao.cidade || licitacao.estado ? ` • ${[licitacao.cidade, licitacao.estado].filter(Boolean).join('/')}` : ''}
              {` • Ano ${licitacao.ano}`}
            </p>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-50 shadow-sm shadow-amber-950/20">
                <Calendar size={10} />
                {licitacao.data_abertura
                  ? `Data de abertura: ${formatAppDate(licitacao.data_abertura)}`
                  : 'Data de abertura não informada'}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getVencimentoClasses(vencimentoInfo.status)}`}>
                {licitacao.data_vencimento ? `Vencimento: ${formatVencimentoDate(licitacao.data_vencimento)} • ${vencimentoInfo.label}` : vencimentoInfo.label}
              </span>
            </div>
          </div>
        </div>

        {isAdmin && (
        <div className="flex flex-wrap gap-3 shrink-0 justify-end">
          <Link
            href={`/dashboard/licitacoes/${licitacao.id}/editar`}
            className="brand-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
          >
            <Pencil size={14} />
            <span>Editar Licitacao</span>
          </Link>
          {summary.valorTotalGanho > 0 && summary.saldoRestante > 0 && (
            <Link
              href={`/dashboard/empenhos/novo?licitacaoId=${licitacao.id}`}
              className="brand-button flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
            >
              <Coins size={14} />
              <span>Adicionar Empenho</span>
            </Link>
          )}
          <Link
            href={`/dashboard/licitacoes/${licitacao.id}/upload-empenho`}
            className="brand-button flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
          >
            <FileText size={14} />
            <span>Upload Empenho</span>
          </Link>

          <Link
            href={`/dashboard/licitacoes/${licitacao.id}/upload-edital`}
            className="brand-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
          >
            <FileText size={14} />
            <span>Anexar Edital</span>
          </Link>
          <Link
            href={`/dashboard/licitacoes/${licitacao.id}/upload-ata`}
            className="brand-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
          >
            <FileText size={14} />
            <span>Anexar ARP/Ata</span>
          </Link>
        </div>
        )}
      </div>

      {/* Aggregate Financial Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Total Ganho */}
        <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between min-h-[100px]">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-bl-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Ganho Homologado</p>
            <Award size={16} className="text-indigo-400" />
          </div>
          <p className="money-value text-xl font-bold text-slate-100 leading-none mt-4 font-mono">
            {formatCurrency(summary.valorTotalGanho)}
          </p>
        </div>

        {/* Total Empenhado */}
        <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between min-h-[100px]">
          <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-bl-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor Empenhado Ativo</p>
            <TrendingUp size={16} className="text-cyan-400" />
          </div>
          <p className="money-value text-xl font-bold text-indigo-400 leading-none mt-4 font-mono">
            {formatCurrency(summary.valorTotalEmpenhado)}
          </p>
        </div>

        {/* Saldo Restante */}
        <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between min-h-[100px] border-emerald-500/10 shadow-[0_0_15px_-5px_rgba(16,185,129,0.15)]">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Restante Disponível</p>
            <TrendingDown size={16} className="text-emerald-400" />
          </div>
          <p className="money-value text-xl font-bold text-emerald-400 leading-none mt-4 font-mono">
            {formatCurrency(summary.saldoRestante)}
          </p>
        </div>
      </div>

      {/* Main Grid: Left side (workstation items sheet), Right side (launched empenhos) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Items Sheet (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Planilha de Saldos dos Itens</h3>
                <p className="text-xs text-slate-400 mt-0.5">Visão granular por insumo, marcas homologadas e consumos em quantidade e valor.</p>
              </div>
            </div>

            {wonItemSaldos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Inbox size={32} className="text-slate-600 mb-2" />
                <p className="text-xs">Esta licitação não possui itens registrados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[980px] w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold bg-slate-950/50">
                      <th className="py-2.5 px-3">Item</th>
                      <th className="name-cell py-2.5 px-3">Descrição / Marca</th>
                      <th className="money-cell py-2.5 px-3">Quantidade</th>
                      <th className="money-cell py-2.5 px-3">Qtd Emp.</th>
                      <th className="money-cell py-2.5 px-3">Saldo Qtd</th>
                      <th className="money-cell py-2.5 px-3">Preço Un.</th>
                      <th className="money-cell py-2.5 px-3">Saldo R$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {wonItemSaldos.map((item) => {
                      const hasSaldo = item.saldoQuantidade > 0;
                      const isLost = false;
                      
                      return (
                        <tr key={item.itemId} className={`hover:bg-slate-900/20 transition-colors ${isLost ? 'opacity-40 bg-slate-950/20' : ''}`}>
                          <td className="py-3.5 px-3 font-mono font-semibold text-slate-400 whitespace-nowrap">#{item.numeroItem}</td>
                          <td className="name-cell py-3.5 px-3">
                            <p className="readable-name font-semibold leading-relaxed text-slate-200">{item.descricao}</p>
                            <p className="readable-name text-[10px] text-slate-500 mt-0.5 font-medium font-mono leading-relaxed">
                              {item.unidade} {item.marca ? `• Marca: ${item.marca}` : ''}
                              {item.codigo_produto ? ` • Código: ${item.codigo_produto}` : ''}
                            </p>
                          </td>
                          <td className="money-cell py-3.5 px-3 text-slate-400 font-mono">
                            {isLost ? '-' : item.quantidadeEdital.toLocaleString('pt-BR')}
                          </td>
                          <td className="money-cell py-3.5 px-3 text-indigo-400 font-bold font-mono">
                            {isLost ? '-' : item.quantidadeEmpenhada.toLocaleString('pt-BR')}
                          </td>
                          <td className={`money-cell py-3.5 px-3 font-bold font-mono ${hasSaldo ? 'text-indigo-300' : 'text-slate-500'}`}>
                            {isLost ? '-' : item.saldoQuantidade.toLocaleString('pt-BR')}
                          </td>
                          <td className="money-cell py-3.5 px-3 text-slate-400 font-mono">
                            {formatCurrency(item.valorUnitario)}
                          </td>
                          <td className={`money-cell py-3.5 px-3 font-bold font-mono ${hasSaldo ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {isLost ? 'Perdido' : formatCurrency(item.saldoFinanceiro)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {otherItemSaldos.length > 0 && (
            <div className="glass-card p-5 border-slate-800 bg-slate-900/20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Itens nao ganhos / pendentes</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Itens que nao entram no saldo disponivel.</p>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {otherItemSaldos.length} item(ns)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[720px] w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-900">
                      <th className="py-2 pr-3 text-left">Item</th>
                      <th className="name-cell py-2 px-3 text-left">Descricao</th>
                      <th className="money-cell py-2 px-3">Quantidade</th>
                      <th className="py-2 pl-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {otherItemSaldos.map((item) => (
                      <tr key={item.itemId} className="text-slate-400">
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">#{item.numeroItem}</td>
                        <td className="name-cell py-2 px-3">
                          <span className="readable-name text-slate-300">{item.descricao}</span>
                          {item.codigo_produto ? <span className="ml-2 text-slate-600 font-mono">{item.codigo_produto}</span> : null}
                        </td>
                        <td className="money-cell py-2 px-3 font-mono">{item.quantidadeEdital.toLocaleString('pt-BR')}</td>
                        <td className="py-2 pl-3 capitalize">{item.status.replace('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes Card */}
          {(licitacao.orgao_contato || licitacao.orgao_email || licitacao.orgao_telefone) && (
            <div className="glass-card p-6 border-slate-800 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contato para Cobrança</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-wide text-[10px]">Responsável</p>
                  <p className="readable-name text-slate-200 font-semibold mt-1">{licitacao.orgao_contato || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-wide text-[10px]">Email</p>
                  {licitacao.orgao_email ? (
                    <a href={`mailto:${licitacao.orgao_email}`} className="readable-name text-indigo-300 hover:text-indigo-200 font-semibold mt-1 block">{licitacao.orgao_email}</a>
                  ) : (
                    <p className="text-slate-200 font-semibold mt-1">-</p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500 font-bold uppercase tracking-wide text-[10px]">Telefone</p>
                  {licitacao.orgao_telefone ? (
                    <a href={`tel:${licitacao.orgao_telefone.replace(/\D/g, '')}`} className="text-indigo-300 hover:text-indigo-200 font-semibold mt-1 block">{licitacao.orgao_telefone}</a>
                  ) : (
                    <p className="text-slate-200 font-semibold mt-1">-</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {stripCommercialContactMarkers(licitacao.observacoes) && (
            <div className="glass-card p-6 border-slate-800 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Observações Detalhadas</h4>
              <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">{stripCommercialContactMarkers(licitacao.observacoes)}</p>
            </div>
          )}
          {licitacao.edital && (
            <div className="glass-card p-4 border-slate-800 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Edital Anexado</h4>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 text-sm">{licitacao.edital.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Enviado em: {new Date(licitacao.edital.uploaded_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {licitacao.edital.contentBase64 ? (
                    <a
                      href={`data:${licitacao.edital.mime || 'application/octet-stream'};base64,${licitacao.edital.contentBase64}`}
                      download={licitacao.edital.name}
                      className="brand-button inline-flex items-center px-3 py-1 text-xs font-semibold"
                    >
                      Baixar
                    </a>
                  ) : null}
                  {isAdmin && (
                    <Link href={`/dashboard/licitacoes/${licitacao.id}/upload-edital`} className="brand-secondary inline-flex items-center px-3 py-1 text-xs font-semibold">Substituir</Link>
                  )}
                </div>
              </div>
            </div>
          )}
          {licitacao.ata && (
            <div className="glass-card p-4 border-slate-800 bg-slate-900/20">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ARP/Ata Anexada</h4>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 text-sm">{licitacao.ata.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Enviado em: {new Date(licitacao.ata.uploaded_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {licitacao.ata.contentBase64 ? (
                    <a
                      href={`data:${licitacao.ata.mime || 'application/octet-stream'};base64,${licitacao.ata.contentBase64}`}
                      download={licitacao.ata.name}
                      className="brand-button inline-flex items-center px-3 py-1 text-xs font-semibold"
                    >
                      Baixar
                    </a>
                  ) : null}
                  {isAdmin && (
                    <Link href={`/dashboard/licitacoes/${licitacao.id}/upload-ata`} className="brand-secondary inline-flex items-center px-3 py-1 text-xs font-semibold">Substituir</Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Commitments List (1/3 width) */}
        <div className="space-y-6">
          <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-100">Empenhos Lançados</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {empenhos.length} lançados
                </span>
                {isAdmin && empenhos.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteAllEmpenhos}
                    disabled={deletingAllEmpenhos}
                    className="inline-flex items-center gap-1 rounded border border-red-900/40 bg-red-950/20 px-2.5 py-1 text-[10px] font-bold text-red-300 transition-colors hover:bg-red-950/40 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Excluir permanentemente todos os empenhos deste pregão"
                  >
                    <Trash2 size={11} />
                    <span>{deletingAllEmpenhos ? 'Excluindo...' : 'Excluir todos'}</span>
                  </button>
                )}
              </div>
            </div>

            {empenhos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-900 rounded-xl text-slate-500 text-center px-4">
                <Inbox size={28} className="text-slate-700 mb-2 animate-pulse" />
                <p className="text-xs font-medium">Nenhum empenho cadastrado para esta licitação.</p>
                {isAdmin && summary.valorTotalGanho > 0 && (
                  <Link
                    href={`/dashboard/empenhos/novo?licitacaoId=${licitacao.id}`}
                    className="brand-button mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold"
                  >
                    <Plus size={12} />
                    <span>Lançar Primeiro</span>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {empenhos.map((emp) => {
                  const isActive = emp.status !== 'cancelado';
                  
                  return (
                    <div 
                      key={emp.id} 
                      className={`p-4 rounded-xl border border-slate-900/80 bg-slate-950/20 flex flex-col gap-3 transition-opacity ${!isActive ? 'opacity-50 bg-slate-950/5' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="readable-name text-xs font-extrabold text-slate-300">Nº {emp.numero_empenho}</p>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 font-medium">
                            <Calendar size={10} />
                            <span>{formatAppDate(emp.data_empenho)}</span>
                          </div>
                        </div>
                        <StatusBadge status={emp.status} />
                      </div>

                      <div className="flex justify-between items-center text-xs font-semibold mt-1.5">
                        <span className="text-slate-400">Total do Empenho:</span>
                        <span className={`money-value font-mono font-bold ${isActive ? 'text-indigo-400' : 'text-slate-500 line-through'}`}>
                          {formatCurrency(emp.valor_empenho)}
                        </span>
                      </div>

                      {emp.observacoes && (
                        <p className="readable-name text-[10px] text-slate-500 bg-slate-950/40 p-2 rounded leading-relaxed border border-slate-900/60">
                          {emp.observacoes}
                        </p>
                      )}

                      {isAdmin && (
                      <div className="flex items-center justify-end gap-2 border-t border-slate-900 pt-3 mt-1.5">
                        {/* Toggle Cancel / Activate */}
                        <button
                          onClick={() => handleToggleEmpenhoStatus(emp)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            isActive 
                              ? 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 border-slate-800' 
                              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                          }`}
                          title={isActive ? 'Cancelar Empenho (recupera saldo)' : 'Reativar Empenho (bloqueia saldo)'}
                        >
                          {isActive ? (
                            <>
                              <PowerOff size={10} />
                              <span>Cancelar</span>
                            </>
                          ) : (
                            <>
                              <Power size={10} />
                              <span>Reativar</span>
                            </>
                          )}
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={() => handleDeleteEmpenho(emp.id, emp.numero_empenho)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-slate-900 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900/30 transition-colors cursor-pointer"
                          title="Excluir Permanentemente"
                        >
                          <Trash2 size={10} />
                          <span>Excluir</span>
                        </button>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
