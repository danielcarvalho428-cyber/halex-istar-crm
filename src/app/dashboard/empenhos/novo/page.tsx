'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Save, 
  Coins, 
  AlertTriangle, 
  Inbox,
  AlertCircle
} from 'lucide-react';
import { db } from '../../../../lib/db';
import { formatAppDate, formatDateInputValue, todayIsoDate, toIsoDate } from '../../../../lib/date';
import { calculateItemSaldos, ItemSaldoResult } from '../../../../lib/saldo';
import { Licitacao, Empenho, EmpenhoItem } from '../../../../types';

function NovoEmpenhoFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryLicitacaoId = searchParams.get('licitacaoId');

  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [selectedLicId, setSelectedLicId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Form Fields State
  const [numeroEmpenho, setNumeroEmpenho] = useState('');
  const [dataEmpenho, setDataEmpenho] = useState(formatAppDate(todayIsoDate()));
  const [observacoes, setObservacoes] = useState('');

  // Selected bidding details
  const [selectedLic, setSelectedLic] = useState<Licitacao | null>(null);
  // Current item balance metrics
  const [itemSaldos, setItemSaldos] = useState<ItemSaldoResult[]>([]);
  // User input quantities: { [itemId]: quantityNumber }
  const [inputQuantities, setInputQuantities] = useState<Record<string, number>>({});

  // Load bidding list on mount
  useEffect(() => {
    async function loadLicitacoes() {
      try {
        const lData = await db.getLicitacoes();
        
        const activeLics = lData.filter(l => l.status !== 'perdida' && l.status !== 'cancelada');
        setLicitacoes(activeLics);

        // Pre-select if provided in query
        if (queryLicitacaoId && activeLics.some(l => l.id === queryLicitacaoId)) {
          setSelectedLicId(queryLicitacaoId);
        } else if (activeLics.length > 0) {
          setSelectedLicId(activeLics[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLicitacoes();
  }, [queryLicitacaoId]);

  // Load items and calculate current saldos when bidding changes
  useEffect(() => {
    if (!selectedLicId) {
      return;
    }

    async function loadLicitacaoDetails() {
      try {
        const detailedLic = await db.getLicitacao(selectedLicId);
        if (!detailedLic) return;

        setSelectedLic(detailedLic);
        
        // Fetch commitments to compute remaining saldo
        const empenhosList = await db.getEmpenhos(selectedLicId);
        const empenhoItensList = await db.getAllEmpenhoItens();

        // Calculate saldos
        const saldos = calculateItemSaldos(
          detailedLic.itens || [],
          empenhosList,
          empenhoItensList
        );

        // Filter: only items marked as 'ganho' or 'parcial' (Rule 2)
        // And discard items where qtyGanha is 0
        const wonSaldos = saldos.filter(s => s.status === 'ganho' || s.status === 'parcial');
        
        setItemSaldos(wonSaldos);

        // Initialize user inputs with 0
        const initialInputs: Record<string, number> = {};
        wonSaldos.forEach(s => {
          initialInputs[s.itemId] = 0;
        });
        setInputQuantities(initialInputs);
      } catch (err) {
        console.error(err);
      }
    }
    loadLicitacaoDetails();
  }, [selectedLicId]);

  // Update quantity committed for a specific item
  const handleUpdateQty = (itemId: string, qty: number) => {
    setInputQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  // Warning evaluations: checks if any item input exceeds available saldo
  const warningList = useMemo(() => {
    const list: { itemId: string; description: string; inputQty: number; availableQty: number }[] = [];
    
    itemSaldos.forEach(item => {
      const inputVal = inputQuantities[item.itemId] || 0;
      if (inputVal > item.saldoQuantidade) {
        list.push({
          itemId: item.itemId,
          description: item.descricao,
          inputQty: inputVal,
          availableQty: item.saldoQuantidade
        });
      }
    });

    return list;
  }, [inputQuantities, itemSaldos]);

  // Calculate dynamic commitment cost reactively
  const totalValueCalculated = useMemo(() => {
    return itemSaldos.reduce((sum, item) => {
      const inputVal = inputQuantities[item.itemId] || 0;
      return sum + (inputVal * item.valorUnitario);
    }, 0);
  }, [inputQuantities, itemSaldos]);

  const hasExceededSaldo = warningList.length > 0;
  const hasNoItemsSelected = totalValueCalculated === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasExceededSaldo) {
      alert('Atenção: Não é possível salvar um empenho que exceda o saldo disponível dos itens.');
      return;
    }
    if (hasNoItemsSelected) {
      alert('Preencha a quantidade empenhada de pelo menos um produto.');
      return;
    }
    if (!numeroEmpenho.trim()) {
      alert('Digite o número da nota de empenho.');
      return;
    }

    const normalizedDataEmpenho = toIsoDate(dataEmpenho);
    if (!normalizedDataEmpenho) {
      alert('Digite a data do empenho no formato dia/mes/ano.');
      return;
    }

    try {
      const newEmpenho: Omit<Empenho, 'created_at' | 'updated_at'> = {
        id: '', // Generated in DB layer
        licitacao_id: selectedLicId,
        numero_empenho: numeroEmpenho.trim(),
        data_empenho: normalizedDataEmpenho,
        orgao: selectedLic?.orgao || null,
        valor_empenho: totalValueCalculated,
        status: 'ativo',
        observacoes: observacoes.trim() || null
      };

      // Map non-zero item inputs to EmpenhoItem structures
      const itemsToSend: Omit<EmpenhoItem, 'id' | 'empenho_id' | 'valor_total'>[] = [];
      
      itemSaldos.forEach(item => {
        const inputQty = inputQuantities[item.itemId] || 0;
        if (inputQty > 0) {
          itemsToSend.push({
            licitacao_item_id: item.itemId,
            quantidade_empenhada: inputQty,
            valor_unitario: item.valorUnitario
          });
        }
      });

      await db.saveEmpenho(newEmpenho, itemsToSend);
      alert('Nota de empenho cadastrada com sucesso!');
      router.push(`/dashboard/licitacoes/${selectedLicId}`);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar empenho no banco de dados.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const parseQuantity = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Carregando dados da licitação...</p>
      </div>
    );
  }

  if (licitacoes.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto glass-card p-8 border-slate-800 bg-slate-900/40">
        <AlertCircle size={40} className="text-amber-500 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-slate-100">Nenhuma Licitação Habilitada</h1>
        <p className="text-slate-400 text-xs mt-2 leading-relaxed">
          Para lançar um empenho, você deve possuir pelo menos uma licitação cadastrada com status ativa ou parcial contendo itens marcados como <strong>Ganhos</strong>.
        </p>
        <Link
          href="/dashboard/licitacoes/nova"
          className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-slate-50 font-semibold rounded text-xs"
        >
          <span>Cadastrar Licitação</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Back button and title */}
      <div className="flex items-start gap-4">
        <Link
          href={selectedLicId ? `/dashboard/licitacoes/${selectedLicId}` : '/dashboard/licitacoes'}
          className="brand-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-50 font-sans sm:text-3xl">Lançar Nota de Empenho</h1>
          <p className="text-slate-400 text-sm mt-1">Consuma as quantidades ganhas de uma ata de registro de preço.</p>
        </div>
      </div>

      {/* Warning List Trigger Alerts */}
      {hasExceededSaldo && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs space-y-2 animate-pulse">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle size={16} className="shrink-0" />
            <span>Regra de Negócio Violada: Super-Empenho Bloqueado</span>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {warningList.map(w => (
              <li key={w.itemId}>
                Você está tentando empenhar <strong>{w.inputQty}</strong> unidades do item <em>&quot;{w.description}&quot;</em>, mas o saldo disponível é de apenas <strong>{w.availableQty}</strong>.
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Form Metadata Card */}
        <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
          <h3 className="text-base font-bold text-slate-100 mb-6 pb-2 border-b border-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">1</span>
            <span>Detalhes do Empenho</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Select Licitação */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Selecionar Licitação / Ata</label>
              <select
                value={selectedLicId}
                onChange={(e) => setSelectedLicId(e.target.value)}
                className="form-input bg-slate-950 border-slate-800"
                required
              >
                {licitacoes.map(lic => (
                  <option key={lic.id} value={lic.id}>
                    Pregão {lic.numero_pregao} - {lic.orgao} ({lic.ano})
                  </option>
                ))}
              </select>
            </div>

            {/* Número do empenho */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Número da Nota de Empenho</label>
              <input
                type="text"
                placeholder="Ex: 2026NE00421"
                value={numeroEmpenho}
                onChange={(e) => setNumeroEmpenho(e.target.value)}
                className="form-input bg-slate-950 border-slate-800 font-mono text-sm"
                required
              />
            </div>

            {/* Data do empenho */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Data do Empenho</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={dataEmpenho}
                  onChange={(e) => setDataEmpenho(formatDateInputValue(e.target.value))}
                  placeholder="dd/mm/aaaa"
                  className="form-input w-full bg-slate-950 border-slate-800 text-sm"
                  required
                />
              </div>
            </div>

            {/* Observações */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Observações do Empenho</label>
              <input
                type="text"
                placeholder="Observações adicionais ou notas de controle de entrega"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="form-input bg-slate-950 border-slate-800 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Form items values allocation */}
        <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
          <div className="mb-6 flex flex-col gap-3 border-b border-slate-900 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">2</span>
              <span>Vincular Insumos e Quantidades</span>
            </h3>
            <span className="text-xs text-indigo-400 bg-indigo-500/5 px-2 py-1 rounded border border-indigo-500/10 font-medium">
              Apenas itens ganhos são exibidos
            </span>
          </div>

          {itemSaldos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Inbox size={32} className="text-slate-700 mb-2" />
              <p className="text-xs">Nenhum item com saldo disponível nesta licitação.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {itemSaldos.map((item) => {
                const inputQty = inputQuantities[item.itemId] || 0;
                const isOver = inputQty > item.saldoQuantidade;

                return (
                  <div 
                    key={item.itemId} 
                    className={`p-4 rounded-xl border transition-all ${
                      isOver 
                        ? 'border-red-500/40 bg-red-950/5' 
                        : inputQty > 0 
                          ? 'border-indigo-500/30 bg-indigo-950/5' 
                          : 'border-slate-900 bg-slate-950/10'
                    }`}
                  >
                    <div className="grid grid-cols-1 gap-4 items-center lg:grid-cols-12">
                      
                      {/* Desc e Specs */}
                      <div className="min-w-0 lg:col-span-5">
                        <p className="readable-name text-xs font-semibold leading-relaxed text-slate-200">{item.descricao}</p>
                        <p className="readable-name text-[10px] text-slate-500 mt-1 font-mono leading-relaxed">
                          {item.unidade} {item.marca ? `• Marca: ${item.marca}` : ''} &bull; Preço: <span className="money-value inline-block">{formatCurrency(item.valorUnitario)}</span>
                        </p>
                      </div>

                      {/* Saldo Disponível */}
                      <div className="text-left lg:col-span-2 lg:text-center">
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Saldo Atual</span>
                        <span className="money-value text-xs font-bold text-slate-300 font-mono">{item.saldoQuantidade.toLocaleString('pt-BR')}</span>
                      </div>

                      {/* Qtd a Empenhar */}
                      <div className="flex flex-col gap-1 lg:col-span-2">
                        <label className="text-[10px] text-slate-500 uppercase font-semibold">Qtd Empenhada</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={inputQty === 0 ? '' : inputQty}
                          onChange={(e) => handleUpdateQty(item.itemId, parseQuantity(e.target.value))}
                          placeholder="0"
                          className={`form-input py-1 text-xs font-mono text-center w-full bg-slate-950 ${
                            isOver ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-800'
                          }`}
                        />
                      </div>

                      {/* Valor total automatico do item */}
                      <div className="text-left lg:col-span-3 lg:text-right">
                        <span className="text-[10px] text-slate-500 uppercase block font-semibold">Subtotal</span>
                        <span className={`money-value text-xs font-bold font-mono ${inputQty > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {formatCurrency(inputQty * item.valorUnitario)}
                        </span>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Sum Summary Card */}
        <div className="glass-card flex flex-col gap-4 border-slate-800 bg-slate-900/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Coins className="text-emerald-400 shrink-0" size={18} />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Valor Total do Empenho</p>
              <p className="money-value text-xl font-black text-emerald-400 font-mono">{formatCurrency(totalValueCalculated)}</p>
            </div>
          </div>
          
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={selectedLicId ? `/dashboard/licitacoes/${selectedLicId}` : '/dashboard/licitacoes'}
              className="brand-secondary px-4 py-2 text-center text-xs font-semibold"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={hasExceededSaldo || hasNoItemsSelected}
              className="brand-button flex items-center justify-center gap-2 rounded-lg px-6 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
            >
              <Save size={14} />
              <span>Confirmar Empenho</span>
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}

// Wrapper supporting useSearchParams suspense opt-out prevention
export default function NovoEmpenhoPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Carregando formulário...</p>
      </div>
    }>
      <NovoEmpenhoFormContent />
    </Suspense>
  );
}
