import { extractCommercialContacts } from '@/lib/commercial-contacts';
import type { CommercialContact, Empenho, Licitacao, LicitacaoItem } from '@/types';

export type PurchaseTrendConfidence = 'alta' | 'media' | 'baixa' | 'insuficiente';
export type PurchaseTrendPriority = 'atrasado' | 'agora' | 'em_breve' | 'acompanhar' | 'sem_previsao';

export type PurchaseTrend = {
  clientKey: string;
  clientCode: string | null;
  client: string;
  region: string;
  state: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  licitacaoId: string;
  events: number;
  source: 'empenhos' | 'pregoes' | 'insuficiente';
  averageIntervalDays: number | null;
  predictedDate: string | null;
  confidence: PurchaseTrendConfidence;
  priority: PurchaseTrendPriority;
  lastPurchaseDate: string | null;
  lastContact: CommercialContact | null;
  contacts: CommercialContact[];
};

export type ProductPurchaseTrend = {
  key: string;
  code: string | null;
  description: string;
  occurrences: number;
  totalQuantity: number;
  totalValue: number;
  lastDate: string | null;
  predictedDate: string | null;
  intervalDays: number | null;
  confidence: PurchaseTrendConfidence;
};

export function normalizeCommercialClient(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function commercialClientKey(licitacao: Pick<Licitacao, 'codigo_cliente' | 'orgao'>) {
  return licitacao.codigo_cliente?.trim()
    ? `code:${licitacao.codigo_cliente.trim()}`
    : `name:${normalizeCommercialClient(licitacao.orgao)}`;
}

function toDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiff(left: Date, right: Date) {
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function uniqueDates(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).slice(0, 10))))
    .map(toDay)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());
}

function priorityFor(predictedDate: Date | null, lastContact: CommercialContact | null): PurchaseTrendPriority {
  const today = toDay(new Date().toISOString())!;
  const followUp = toDay(lastContact?.next_contact_at);
  const target = followUp || predictedDate;
  if (!target) return 'sem_previsao';
  const days = dayDiff(today, target);
  if (days < 0) return 'atrasado';
  if (days <= 14) return 'agora';
  if (days <= 45) return 'em_breve';
  return 'acompanhar';
}

export function buildPurchaseTrends(licitacoes: Licitacao[], empenhos: Empenho[]) {
  const groups = new Map<string, Licitacao[]>();
  licitacoes.forEach((licitacao) => {
    const key = commercialClientKey(licitacao);
    groups.set(key, [...(groups.get(key) || []), licitacao]);
  });
  const licitacaoById = new Map(licitacoes.map((licitacao) => [licitacao.id, licitacao]));
  const empenhosByClient = new Map<string, Empenho[]>();
  empenhos.filter((empenho) => empenho.status !== 'cancelado').forEach((empenho) => {
    const licitacao = licitacaoById.get(empenho.licitacao_id);
    if (!licitacao) return;
    const key = commercialClientKey(licitacao);
    empenhosByClient.set(key, [...(empenhosByClient.get(key) || []), empenho]);
  });

  return Array.from(groups.entries()).map(([clientKey, clientLicitacoes]): PurchaseTrend => {
    const sortedLicitacoes = [...clientLicitacoes].sort(
      (a, b) => (b.data_abertura || b.created_at).localeCompare(a.data_abertura || a.created_at)
    );
    const latest = sortedLicitacoes[0];
    const purchaseDates = uniqueDates((empenhosByClient.get(clientKey) || []).map((item) => item.data_empenho));
    const tenderDates = uniqueDates(
      clientLicitacoes
        .filter((item) => item.status === 'ganha' || item.status === 'parcial' || item.valor_total_ganho > 0)
        .map((item) => item.data_abertura || item.created_at)
    );
    const eventDates = purchaseDates.length >= 2 ? purchaseDates : tenderDates;
    const source = purchaseDates.length >= 2 ? 'empenhos' : tenderDates.length ? 'pregoes' : 'insuficiente';
    const intervals = eventDates.slice(1).map((date, index) => dayDiff(eventDates[index], date)).filter((days) => days >= 7);
    let intervalDays: number | null = intervals.length ? median(intervals) : eventDates.length === 1 ? 365 : null;
    if (intervalDays) intervalDays = Math.max(14, Math.min(730, intervalDays));
    const lastEvent = eventDates.at(-1) || null;
    const predicted = lastEvent && intervalDays ? addDays(lastEvent, intervalDays) : null;

    let confidence: PurchaseTrendConfidence = 'insuficiente';
    if (intervals.length >= 4) {
      const spread = Math.max(...intervals) - Math.min(...intervals);
      confidence = spread <= (intervalDays || 1) * 0.75 ? 'alta' : 'media';
    } else if (intervals.length >= 2) {
      confidence = 'media';
    } else if (eventDates.length > 0) {
      confidence = 'baixa';
    }

    const contacts = clientLicitacoes
      .flatMap((licitacao) => extractCommercialContacts(licitacao.observacoes))
      .filter((contact) => contact.client_key === clientKey)
      .sort((a, b) => b.contacted_at.localeCompare(a.contacted_at));
    const lastContact = contacts[0] || null;

    return {
      clientKey,
      clientCode: latest.codigo_cliente || null,
      client: latest.orgao,
      region: latest.carteira_regiao || 'Sem carteira',
      state: latest.estado || null,
      phone: latest.orgao_telefone || null,
      email: latest.orgao_email || null,
      contactName: latest.orgao_contato || null,
      licitacaoId: latest.id,
      events: eventDates.length,
      source,
      averageIntervalDays: intervalDays,
      predictedDate: predicted ? isoDay(predicted) : null,
      confidence,
      priority: priorityFor(predicted, lastContact),
      lastPurchaseDate: lastEvent ? isoDay(lastEvent) : null,
      lastContact,
      contacts,
    };
  }).sort((left, right) => {
    const rank: Record<PurchaseTrendPriority, number> = {
      atrasado: 0, agora: 1, em_breve: 2, acompanhar: 3, sem_previsao: 4,
    };
    return rank[left.priority] - rank[right.priority]
      || (right.predictedDate || '').localeCompare(left.predictedDate || '');
  });
}

export function buildClientProductTrends(clientLicitacoes: Licitacao[], items: LicitacaoItem[]) {
  const licitacaoById = new Map(clientLicitacoes.map((item) => [item.id, item]));
  const groups = new Map<string, { item: LicitacaoItem; dates: Date[]; quantity: number; value: number }>();
  items.filter((item) => item.status === 'ganho' && licitacaoById.has(item.licitacao_id)).forEach((item) => {
    const licitacao = licitacaoById.get(item.licitacao_id)!;
    const key = item.codigo_produto?.trim()
      ? `code:${item.codigo_produto.trim()}`
      : `name:${normalizeCommercialClient(item.descricao)}:${normalizeCommercialClient(item.unidade)}`;
    const date = toDay(licitacao.data_abertura || licitacao.created_at);
    const group = groups.get(key) || { item, dates: [], quantity: 0, value: 0 };
    if (date) group.dates.push(date);
    group.quantity += item.quantidade;
    group.value += item.quantidade * item.valor_unitario;
    groups.set(key, group);
  });

  return Array.from(groups.entries()).map(([key, group]): ProductPurchaseTrend => {
    const dates = Array.from(new Map(group.dates.map((date) => [isoDay(date), date])).values())
      .sort((a, b) => a.getTime() - b.getTime());
    const intervals = dates.slice(1).map((date, index) => dayDiff(dates[index], date)).filter((days) => days >= 7);
    const intervalDays = intervals.length ? Math.max(14, Math.min(730, median(intervals))) : dates.length ? 365 : null;
    const last = dates.at(-1) || null;
    const predicted = last && intervalDays ? addDays(last, intervalDays) : null;
    return {
      key,
      code: group.item.codigo_produto || null,
      description: group.item.descricao,
      occurrences: dates.length,
      totalQuantity: group.quantity,
      totalValue: group.value,
      lastDate: last ? isoDay(last) : null,
      predictedDate: predicted ? isoDay(predicted) : null,
      intervalDays,
      confidence: intervals.length >= 3 ? 'alta' : intervals.length >= 1 ? 'media' : dates.length ? 'baixa' : 'insuficiente',
    };
  }).sort((left, right) => right.totalValue - left.totalValue);
}
