import type { Licitacao, LicitacaoItem, Empenho, EmpenhoItem } from '../types/index.ts';

export interface ItemSaldoResult {
  itemId: string;
  descricao: string;
  numeroItem: number;
  unidade: string;
  marca: string | null;
  codigo_produto?: string | null;
  quantidadeEdital: number;
  quantidadeGanha: number;
  quantidadeEmpenhada: number;
  saldoQuantidade: number;
  precoMinimo?: number | null;
  valorUnitario: number;
  valorGanho: number;
  valorEmpenhado: number;
  saldoFinanceiro: number;
  status: string;
}

export interface LicitacaoSummary {
  licitacaoId: string;
  numeroPregao: string;
  orgao: string;
  ano: number;
  status: string;
  valorTotalGanho: number;
  valorTotalEmpenhado: number;
  saldoRestante: number;
  itemSaldos: ItemSaldoResult[];
  empenhosAtivosCount: number;
}

function activeEmpenhosValue(empenhos: Empenho[]) {
  return empenhos
    .filter((empenho) => empenho.status !== 'cancelado')
    .reduce((sum, empenho) => sum + Number(empenho.valor_empenho || 0), 0);
}

/**
 * Calculates the quantity and financial saldo for a list of items belonging to a bidding,
 * considering all launched commitments (empenhos) and their commitment items.
 * 
 * Enforces Rule 2 (only 'ganho' or 'parcial' items count for saldo)
 * Enforces Rule 3 (cancelled empenhos do not reduce saldo)
 */
export function calculateItemSaldos(
  items: LicitacaoItem[],
  empenhos: Empenho[],
  empenhoItens: EmpenhoItem[]
): ItemSaldoResult[] {
  // 1. Filter out active/non-cancelled commitments
  const activeEmpenhos = empenhos.filter(e => e.status !== 'cancelado');
  const activeEmpenhoIds = new Set(activeEmpenhos.map(e => e.id));

  // 2. Filter commitment items that belong to active commitments
  const activeEmpenhoItens = empenhoItens.filter(ei => activeEmpenhoIds.has(ei.empenho_id));

  // 3. Group empenho items by licitacao_item_id for O(1) lookup per item
  const empenhoQtyMap = new Map<string, number>();
  const empenhoValueMap = new Map<string, number>();
  for (const ei of activeEmpenhoItens) {
    const prev = empenhoQtyMap.get(ei.licitacao_item_id) || 0;
    const prevValue = empenhoValueMap.get(ei.licitacao_item_id) || 0;
    const quantidade = Number(ei.quantidade_empenhada || 0);
    const valorUnitario = Number(ei.valor_unitario || 0);
    const valorTotal = Number(ei.valor_total || quantidade * valorUnitario);
    empenhoQtyMap.set(ei.licitacao_item_id, prev + quantidade);
    empenhoValueMap.set(ei.licitacao_item_id, prevValue + valorTotal);
  }

  return items.map(item => {
    const isWon = item.status === 'ganho';
    const qtyGanha = isWon ? item.quantidade : 0;
    const valGanho = isWon ? (item.quantidade * item.valor_unitario) : 0;

    const qtyEmpenhada = empenhoQtyMap.get(item.id) || 0;
    const valEmpenhado = empenhoValueMap.get(item.id) || qtyEmpenhada * item.valor_unitario;

    const saldoQty = Math.max(0, qtyGanha - qtyEmpenhada);
    const saldoFin = saldoQty * item.valor_unitario;

    return {
      itemId: item.id,
      descricao: item.descricao,
      numeroItem: item.numero_item,
      unidade: item.unidade,
      marca: item.marca,
      codigo_produto: item.codigo_produto,
      quantidadeEdital: item.quantidade,
      quantidadeGanha: qtyGanha,
      quantidadeEmpenhada: qtyEmpenhada,
      saldoQuantidade: saldoQty,
      precoMinimo: item.preco_minimo,
      valorUnitario: item.valor_unitario,
      valorGanho: valGanho,
      valorEmpenhado: valEmpenhado,
      saldoFinanceiro: saldoFin,
      status: item.status,
    };
  });
}

/**
 * Calculates a summary profile for a single bidding, containing aggregate financials and item-level balances.
 */
export function calculateLicitacaoSummary(
  licitacao: Licitacao,
  items: LicitacaoItem[],
  empenhos: Empenho[],
  empenhoItens: EmpenhoItem[]
): LicitacaoSummary {
  // Filter commitments and sub-items belonging ONLY to this bidding
  const licEmpenhos = empenhos.filter(e => e.licitacao_id === licitacao.id);
  const licEmpenhoIds = new Set(licEmpenhos.map(e => e.id));
  const licEmpenhoItens = empenhoItens.filter(ei => licEmpenhoIds.has(ei.empenho_id));
  
  // Calculate item-level details
  const itemSaldos = calculateItemSaldos(items, licEmpenhos, licEmpenhoItens);

  // Sum aggregates
  const valorTotalGanho = itemSaldos.reduce((sum, item) => sum + item.valorGanho, 0);
  const valorTotalEmpenhado = activeEmpenhosValue(licEmpenhos);
  const saldoRestante = Math.max(0, valorTotalGanho - valorTotalEmpenhado);
  const empenhosAtivosCount = licEmpenhos.filter(e => e.status !== 'cancelado').length;

  return {
    licitacaoId: licitacao.id,
    numeroPregao: licitacao.numero_pregao,
    orgao: licitacao.orgao,
    ano: licitacao.ano,
    status: licitacao.status,
    valorTotalGanho,
    valorTotalEmpenhado,
    saldoRestante,
    itemSaldos,
    empenhosAtivosCount,
  };
}

/**
 * Global aggregation calculation for dashboard metrics.
 */
export interface DashboardStats {
  totalWon: number;
  totalCommitted: number;
  totalRemaining: number;
  activeLicitacoesCount: number;
  availableItemsCount: number; // items with remaining saldo > 0
  fullyCommittedItemsCount: number; // items with won > 0 and remaining saldo = 0
}

export function calculateDashboardStats(
  licitacoes: Licitacao[],
  allItems: LicitacaoItem[],
  empenhos: Empenho[],
  empenhoItens: EmpenhoItem[],
  yearFilter: number | 'todos' = 'todos'
): DashboardStats {
  // 1. Filter biddings by year if requested
  const filteredLicitacoes = yearFilter === 'todos'
    ? licitacoes
    : licitacoes.filter(l => l.ano === yearFilter);

  const licIds = new Set(filteredLicitacoes.map(l => l.id));

  // 2. Filter items belonging to the filtered biddings
  const filteredItems = allItems.filter(i => licIds.has(i.licitacao_id));

  // 3. Filter commitments belonging to the filtered biddings
  const filteredEmpenhos = empenhos.filter(e => licIds.has(e.licitacao_id));
  const filteredEmpenhoIds = new Set(filteredEmpenhos.map(e => e.id));
  
  // 4. Filter commitment items
  const filteredEmpenhoItens = empenhoItens.filter(ei => filteredEmpenhoIds.has(ei.empenho_id));

  // 5. Calculate saldos for each item
  const itemSaldos = calculateItemSaldos(filteredItems, filteredEmpenhos, filteredEmpenhoItens);

  // 6. Aggregate
  const totalWon = itemSaldos.reduce((sum, item) => sum + item.valorGanho, 0);
  const totalCommitted = activeEmpenhosValue(filteredEmpenhos);
  const totalRemaining = Math.max(0, totalWon - totalCommitted);
  
  const activeLicitacoesCount = filteredLicitacoes.filter(l => l.status === 'em_andamento' || l.status === 'parcial' || l.status === 'ganha').length;

  let availableItemsCount = 0;
  let fullyCommittedItemsCount = 0;

  itemSaldos.forEach(item => {
    // Only items that were won are counted
    if (item.quantidadeGanha > 0) {
      if (item.saldoQuantidade > 0) {
        availableItemsCount++;
      } else {
        fullyCommittedItemsCount++;
      }
    }
  });

  return {
    totalWon,
    totalCommitted,
    totalRemaining,
    activeLicitacoesCount,
    availableItemsCount,
    fullyCommittedItemsCount
  };
}
