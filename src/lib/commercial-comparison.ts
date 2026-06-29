import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '@/types';

export type CommercialYearMetrics = {
  won: number;
  sold: number;
  remaining: number;
  wonQuantity: number;
  soldQuantity: number;
  tenders: number;
  items: number;
};

export type CommercialProductComparison = {
  key: string;
  code: string | null;
  description: string;
  unit: string;
  metrics2025: CommercialYearMetrics;
  metrics2026: CommercialYearMetrics;
  recoveryOpportunity: number;
};

export type CommercialClientComparison = {
  key: string;
  clientCode: string | null;
  client: string;
  region: string;
  state: string | null;
  metrics2025: CommercialYearMetrics;
  metrics2026: CommercialYearMetrics;
  wonChange: number;
  soldChange: number;
  recoveryOpportunity: number;
  retentionPercent: number | null;
  products: CommercialProductComparison[];
};

export type CommercialRegionComparison = {
  region: string;
  clients: number;
  clientsAtRisk: number;
  metrics2025: CommercialYearMetrics;
  metrics2026: CommercialYearMetrics;
  recoveryOpportunity: number;
};

const emptyMetrics = (): CommercialYearMetrics => ({
  won: 0,
  sold: 0,
  remaining: 0,
  wonQuantity: 0,
  soldQuantity: 0,
  tenders: 0,
  items: 0,
});

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function clientKey(licitacao: Licitacao) {
  return licitacao.codigo_cliente
    ? `code:${licitacao.codigo_cliente.trim()}`
    : `name:${normalize(licitacao.orgao)}`;
}

function productKey(item: LicitacaoItem) {
  return item.codigo_produto
    ? `code:${item.codigo_produto.trim()}`
    : `description:${normalize(item.descricao)}:${normalize(item.unidade)}`;
}

function importedRemainingQuantity(item: LicitacaoItem) {
  const match = item.observacoes?.match(/(?:^|;)\s*saldo\s+(-?\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function addMetrics(target: CommercialYearMetrics, source: CommercialYearMetrics) {
  target.won += source.won;
  target.sold += source.sold;
  target.remaining += source.remaining;
  target.wonQuantity += source.wonQuantity;
  target.soldQuantity += source.soldQuantity;
  target.tenders += source.tenders;
  target.items += source.items;
}

export function buildCommercialComparison(
  licitacoes: Licitacao[],
  items: LicitacaoItem[],
  empenhos: Empenho[],
  empenhoItems: EmpenhoItem[]
) {
  const relevantLicitacoes = licitacoes.filter((licitacao) => licitacao.ano === 2025 || licitacao.ano === 2026);
  const relevantIds = new Set(relevantLicitacoes.map((licitacao) => licitacao.id));
  const licitacaoById = new Map(relevantLicitacoes.map((licitacao) => [licitacao.id, licitacao]));
  const activeEmpenhoIds = new Set(
    empenhos
      .filter((empenho) => relevantIds.has(empenho.licitacao_id) && empenho.status !== 'cancelado')
      .map((empenho) => empenho.id)
  );
  const committedQuantityByItem = new Map<string, number>();

  empenhoItems.forEach((item) => {
    if (!activeEmpenhoIds.has(item.empenho_id)) return;
    committedQuantityByItem.set(
      item.licitacao_item_id,
      (committedQuantityByItem.get(item.licitacao_item_id) || 0) + item.quantidade_empenhada
    );
  });

  type MutableProduct = Omit<CommercialProductComparison, 'recoveryOpportunity'>;
  type MutableClient = Omit<
    CommercialClientComparison,
    'wonChange' | 'soldChange' | 'recoveryOpportunity' | 'retentionPercent' | 'products'
  > & {
    products: Map<string, MutableProduct>;
    tenderIds2025: Set<string>;
    tenderIds2026: Set<string>;
  };

  const clients = new Map<string, MutableClient>();

  relevantLicitacoes.forEach((licitacao) => {
    const key = clientKey(licitacao);
    const existing = clients.get(key);
    if (existing) {
      if (licitacao.ano === 2025) existing.tenderIds2025.add(licitacao.id);
      if (licitacao.ano === 2026) existing.tenderIds2026.add(licitacao.id);
      return;
    }

    clients.set(key, {
      key,
      clientCode: licitacao.codigo_cliente || null,
      client: licitacao.orgao,
      region: licitacao.carteira_regiao || 'Sem região',
      state: licitacao.estado || null,
      metrics2025: emptyMetrics(),
      metrics2026: emptyMetrics(),
      products: new Map(),
      tenderIds2025: new Set(licitacao.ano === 2025 ? [licitacao.id] : []),
      tenderIds2026: new Set(licitacao.ano === 2026 ? [licitacao.id] : []),
    });
  });

  items.forEach((item) => {
    const licitacao = licitacaoById.get(item.licitacao_id);
    if (!licitacao || item.status !== 'ganho') return;

    const client = clients.get(clientKey(licitacao));
    if (!client) return;

    const importedRemaining = importedRemainingQuantity(item);
    const committedQuantity = committedQuantityByItem.get(item.id) || 0;
    const remainingQuantity = Math.min(
      item.quantidade,
      importedRemaining ?? Math.max(0, item.quantidade - committedQuantity)
    );
    const soldQuantity = Math.max(0, item.quantidade - remainingQuantity);
    const metrics: CommercialYearMetrics = {
      won: item.quantidade * item.valor_unitario,
      sold: soldQuantity * item.valor_unitario,
      remaining: remainingQuantity * item.valor_unitario,
      wonQuantity: item.quantidade,
      soldQuantity,
      tenders: 0,
      items: 1,
    };
    const yearMetrics = licitacao.ano === 2025 ? client.metrics2025 : client.metrics2026;
    addMetrics(yearMetrics, metrics);

    const key = productKey(item);
    const product = client.products.get(key) || {
      key,
      code: item.codigo_produto || null,
      description: item.descricao,
      unit: item.unidade,
      metrics2025: emptyMetrics(),
      metrics2026: emptyMetrics(),
    };
    addMetrics(licitacao.ano === 2025 ? product.metrics2025 : product.metrics2026, metrics);
    client.products.set(key, product);
  });

  const comparisons: CommercialClientComparison[] = Array.from(clients.values()).map((client) => {
    client.metrics2025.tenders = client.tenderIds2025.size;
    client.metrics2026.tenders = client.tenderIds2026.size;

    const products = Array.from(client.products.values())
      .map((product): CommercialProductComparison => ({
        ...product,
        recoveryOpportunity: Math.max(0, product.metrics2025.sold - product.metrics2026.won),
      }))
      .sort((left, right) => right.recoveryOpportunity - left.recoveryOpportunity);
    const recoveryOpportunity = products.reduce(
      (total, product) => total + product.recoveryOpportunity,
      0
    );

    return {
      key: client.key,
      clientCode: client.clientCode,
      client: client.client,
      region: client.region,
      state: client.state,
      metrics2025: client.metrics2025,
      metrics2026: client.metrics2026,
      wonChange: client.metrics2026.won - client.metrics2025.won,
      soldChange: client.metrics2026.sold - client.metrics2025.sold,
      recoveryOpportunity,
      retentionPercent: client.metrics2025.won > 0
        ? (client.metrics2026.won / client.metrics2025.won) * 100
        : null,
      products,
    };
  });

  const regionMap = new Map<string, CommercialRegionComparison>();
  comparisons.forEach((client) => {
    const region = regionMap.get(client.region) || {
      region: client.region,
      clients: 0,
      clientsAtRisk: 0,
      metrics2025: emptyMetrics(),
      metrics2026: emptyMetrics(),
      recoveryOpportunity: 0,
    };
    region.clients += 1;
    if (client.recoveryOpportunity > 0) region.clientsAtRisk += 1;
    addMetrics(region.metrics2025, client.metrics2025);
    addMetrics(region.metrics2026, client.metrics2026);
    region.recoveryOpportunity += client.recoveryOpportunity;
    regionMap.set(client.region, region);
  });

  return {
    clients: comparisons.sort((left, right) => right.recoveryOpportunity - left.recoveryOpportunity),
    regions: Array.from(regionMap.values()).sort(
      (left, right) => right.recoveryOpportunity - left.recoveryOpportunity
    ),
  };
}
