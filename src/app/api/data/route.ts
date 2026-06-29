import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, getSessionFromToken } from '@/lib/auth';
import { privateJson } from '@/lib/http';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { encodeCommercialContact, encodeCommercialOpportunity, encodeCommercialTask, preserveCommercialContactMarkers } from '@/lib/commercial-contacts';
import {
  normalizeHalexDocument,
  normalizeHalexIdentifier,
  type BulkEmpenhoImportEntry,
  type BulkEmpenhoImportResult,
} from '@/lib/halex-bulk-empenho';
import { commercialClientKey } from '@/lib/purchase-trends';
import { parseAppDate } from '@/lib/date';
import { fetchAllSupabaseRows } from '@/lib/supabase-pagination';
import type { AuditEvent, CommercialContact, CommercialContactOutcome, CommercialOpportunity, CommercialPipelineStage, CommercialTask, CommercialTaskStatus, CommercialTaskType, Empenho, EmpenhoItem, Licitacao, LicitacaoAttachment, LicitacaoItem, ProductCatalogItem } from '@/types';

type DataAction =
  | 'getAppData'
  | 'getLicitacoes'
  | 'getLicitacao'
  | 'getAllItens'
  | 'saveLicitacao'
  | 'deleteLicitacao'
  | 'duplicateLicitacao'
  | 'attachEdital'
  | 'getEdital'
  | 'attachAta'
  | 'getAta'
  | 'exportBackup'
  | 'importBackup'
  | 'getProductCatalog'
  | 'saveProductCatalog'
  | 'getAuditEvents'
  | 'getEmpenhos'
  | 'getEmpenho'
  | 'saveEmpenho'
  | 'saveBulkEmpenhos'
  | 'deleteEmpenho'
  | 'deleteEmpenhosByLicitacao'
  | 'getAllEmpenhoItens'
  | 'saveCommercialContact'
  | 'saveCommercialOpportunity'
  | 'saveCommercialTask';

type DataRequest = {
  action?: DataAction;
  payload?: Record<string, unknown>;
};

class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const licitacaoStatuses = new Set(['em_andamento', 'ganha', 'perdida', 'cancelada', 'parcial']);
const itemStatuses = new Set(['ganho', 'perdido', 'cancelado', 'desclassificado', 'pendente']);
const empenhoStatuses = new Set(['ativo', 'entregue', 'parcial', 'cancelado', 'pago']);
const commercialContactOutcomes = new Set<CommercialContactOutcome>([
  'contato_realizado',
  'interessado',
  'sem_resposta',
  'retornar',
  'sem_interesse',
]);
const commercialPipelineStages = new Set<CommercialPipelineStage>([
  'identificado', 'contato', 'interessado', 'proposta', 'negociacao', 'recuperado', 'perdido',
]);
const commercialTaskTypes = new Set<CommercialTaskType>([
  'ligacao', 'whatsapp', 'email', 'reuniao', 'proposta', 'outro',
]);
const commercialTaskStatuses = new Set<CommercialTaskStatus>(['pendente', 'concluida', 'cancelada']);
const licitacaoListColumns = [
  'id',
  'ano',
  'orgao',
  'codigo_cliente',
  'carteira_regiao',
  'cidade',
  'estado',
  'orgao_email',
  'orgao_telefone',
  'orgao_contato',
  'numero_pregao',
  'numero_processo',
  'modalidade',
  'data_abertura',
  'data_vencimento',
  'status',
  'valor_total_ganho',
  'observacoes',
  'created_at',
  'updated_at',
].join(',');

type LicitacaoItemRow = {
  id: string;
  licitacao_id: string;
  numero_item?: number | null;
  descricao?: string | null;
  quantidade: number;
  valor_unitario: number;
  status: string;
  codigo_produto?: string | null;
};

function requireText(value: unknown, label: string, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestError(`${label} is required.`);
  }
  return value.trim().slice(0, maxLength);
}

function requirePositiveInteger(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequestError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function requireNonNegativeNumber(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RequestError(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function normalizedText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

const quotaDescriptionWords = new Set([
  'AMPLA',
  'COTA',
  'CONCORRENCIA',
  'DIFERENCIADO',
  'EMPRESA',
  'EMPRESAS',
  'EPP',
  'EXCLUSIVA',
  'EXCLUSIVO',
  'GRANDE',
  'ITEM',
  'LC',
  'LOTE',
  'ME',
  'MEI',
  'MICRO',
  'MICROEMPRESA',
  'MICROEMPRESAS',
  'PARTICIPACAO',
  'PORTE',
  'RESERVADA',
  'RESERVADO',
]);

function productDescriptionWords(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !quotaDescriptionWords.has(word));
}

function productDescriptionsMatch(a: unknown, b: unknown) {
  const wordsA = productDescriptionWords(a);
  const wordsB = productDescriptionWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const compactA = wordsA.join('');
  const compactB = wordsB.join('');
  if (compactA === compactB) return true;
  if (compactA.length >= 8 && compactB.length >= 8 && (compactA.includes(compactB) || compactB.includes(compactA))) {
    return true;
  }

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let common = 0;
  for (const word of setA) {
    if (setB.has(word)) common++;
  }

  const smaller = Math.min(setA.size, setB.size);
  return common >= 2 && common / smaller >= 0.7;
}

function samePrice(a: unknown, b: unknown) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= 0.01;
}

function isAfterContractExpiration(dataEmpenho?: string | null, dataVencimento?: string | null) {
  const empenhoDate = parseAppDate(dataEmpenho);
  const vencimentoDate = parseAppDate(dataVencimento);
  if (!empenhoDate || !vencimentoDate) return false;

  empenhoDate.setHours(0, 0, 0, 0);
  vencimentoDate.setHours(0, 0, 0, 0);
  return empenhoDate > vencimentoDate;
}

function areSameProductLicitacaoItems(a: LicitacaoItemRow, b: LicitacaoItemRow) {
  if (a.licitacao_id !== b.licitacao_id) return false;
  if (b.status !== 'ganho') return false;

  const codeA = normalizedText(a.codigo_produto);
  const codeB = normalizedText(b.codigo_produto);
  if (codeA && codeB && codeA === codeB) return true;

  return productDescriptionsMatch(a.descricao, b.descricao);
}

function areEquivalentLicitacaoItems(a: LicitacaoItemRow, b: LicitacaoItemRow) {
  return samePrice(a.valor_unitario, b.valor_unitario) && areSameProductLicitacaoItems(a, b);
}

function canFallbackToSamePriceItem(a: LicitacaoItemRow, b: LicitacaoItemRow) {
  if (a.licitacao_id !== b.licitacao_id) return false;
  if (b.status !== 'ganho') return false;
  return samePrice(a.valor_unitario, b.valor_unitario);
}

function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new RequestError('Cross-origin mutation blocked.', 403);
  }
}

function validateAttachment(value: unknown) {
  if (!value || typeof value !== 'object') throw new RequestError('Invalid attachment.');
  const attachment = value as LicitacaoAttachment;
  requireText(attachment.name, 'Attachment name', 255);
  if (attachment.contentBase64 && attachment.contentBase64.length > 3_500_000) {
    throw new RequestError('Attachment is too large. Maximum file size is 2.5 MB.', 413);
  }
  return attachment;
}

function withoutGeneratedTotal<T extends { valor_total?: number }>(item: T) {
  const clone = { ...item };
  delete clone.valor_total;
  return clone;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function makeError(message: string, status = 400) {
  return privateJson({ ok: false, message }, { status });
}

function ok<T>(data?: T) {
  return privateJson(data === undefined ? { ok: true } : { ok: true, data });
}

async function requireAuthenticatedRequest() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  return getSessionFromToken(token);
}

async function writeAudit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  session: NonNullable<Awaited<ReturnType<typeof getSessionFromToken>>>,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await supabase.from('audit_events').insert({
    actor_username: session.displayName || session.username,
    actor_role: session.role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    metadata,
  });
  if (error) console.error('Failed to write audit event:', error.message);
}

function mergeCommercialRecordsIntoLicitacoes(
  licitacoes: Licitacao[],
  contacts: CommercialContact[],
  opportunities: CommercialOpportunity[],
  tasks: CommercialTask[]
) {
  const markersByLicitacao = new Map<string, string[]>();
  const add = (licitacaoId: string, marker: string) => {
    markersByLicitacao.set(licitacaoId, [...(markersByLicitacao.get(licitacaoId) || []), marker]);
  };
  contacts.forEach((item) => add(item.licitacao_id, encodeCommercialContact(item)));
  opportunities.forEach((item) => add(item.licitacao_id, encodeCommercialOpportunity(item)));
  tasks.forEach((item) => add(item.licitacao_id, encodeCommercialTask(item)));
  return licitacoes.map((licitacao) => ({
    ...licitacao,
    observacoes: [
      licitacao.observacoes,
      ...(markersByLicitacao.get(licitacao.id) || []),
    ].filter(Boolean).join('\n') || null,
  }));
}

const adminOnlyActions = new Set<DataAction>([
  'saveLicitacao',
  'deleteLicitacao',
  'duplicateLicitacao',
  'attachEdital',
  'attachAta',
  'importBackup',
  'saveProductCatalog',
  'saveEmpenho',
  'saveBulkEmpenhos',
  'deleteEmpenho',
  'deleteEmpenhosByLicitacao',
  'saveCommercialContact',
  'saveCommercialOpportunity',
  'saveCommercialTask',
]);

function getLicitacaoPayload(licitacao: Licitacao) {
  return {
    id: licitacao.id,
    ano: licitacao.ano,
    orgao: licitacao.orgao,
    codigo_cliente: licitacao.codigo_cliente,
    carteira_regiao: licitacao.carteira_regiao,
    cidade: licitacao.cidade,
    estado: licitacao.estado,
    orgao_email: licitacao.orgao_email,
    orgao_telefone: licitacao.orgao_telefone,
    orgao_contato: licitacao.orgao_contato,
    numero_pregao: licitacao.numero_pregao,
    numero_processo: licitacao.numero_processo,
    modalidade: licitacao.modalidade,
    data_abertura: licitacao.data_abertura,
    data_vencimento: licitacao.data_vencimento,
    status: licitacao.status,
    valor_total_ganho: licitacao.valor_total_ganho,
    observacoes: licitacao.observacoes,
    edital: licitacao.edital,
    ata: licitacao.ata,
    created_at: licitacao.created_at,
    updated_at: licitacao.updated_at,
  };
}

async function getLicitacao(id: string): Promise<Licitacao | null> {
  const supabase = createSupabaseAdminClient();
  const { data: licitacao, error: licError } = await supabase
    .from('licitacoes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (licError) throw licError;
  if (!licitacao) return null;

  const { data: itens, error: itensError } = await supabase
    .from('licitacao_itens')
    .select('*')
    .eq('licitacao_id', id)
    .order('numero_item', { ascending: true });

  if (itensError) throw itensError;
  return { ...licitacao, itens: itens || [] };
}

async function saveLicitacao(payload: Record<string, unknown>) {
  const licitacao = payload.licitacao as Omit<Licitacao, 'created_at' | 'updated_at'>;
  const items = (payload.items || []) as Omit<LicitacaoItem, 'id' | 'licitacao_id' | 'valor_total'>[];
  if (!licitacao || typeof licitacao !== 'object') throw new RequestError('Invalid licitacao payload.');
  if (!Array.isArray(items) || items.length === 0) throw new RequestError('At least one item is required.');

  const ano = requirePositiveInteger(licitacao.ano, 'Ano');
  if (ano < 2000 || ano > 2100) throw new RequestError('Ano is outside the supported range.');
  const orgao = requireText(licitacao.orgao, 'Orgao', 255);
  const numeroPregao = requireText(licitacao.numero_pregao, 'Numero do pregao', 100);
  if (!licitacaoStatuses.has(licitacao.status)) throw new RequestError('Invalid licitacao status.');

  const isNew = !licitacao.id || licitacao.id === '';
  const licId = isNew ? crypto.randomUUID() : licitacao.id;
  const now = new Date().toISOString();

  const seenItemIds = new Set<string>();
  const normalizedItems = items.map((item, index) => {
    const id = (item as Partial<LicitacaoItem>).id || crypto.randomUUID();
    if (seenItemIds.has(id)) throw new RequestError('Duplicate item id.');
    seenItemIds.add(id);
    if (!itemStatuses.has(item.status)) throw new RequestError(`Invalid status for item ${index + 1}.`);

    const quantidade = requirePositiveInteger(item.quantidade, `Quantidade do item ${index + 1}`);
    const valorUnitario = requireNonNegativeNumber(item.valor_unitario, `Valor do item ${index + 1}`);

    return {
      ...item,
      id,
      licitacao_id: licId,
      numero_item: requirePositiveInteger(item.numero_item || index + 1, `Numero do item ${index + 1}`),
      descricao: requireText(item.descricao, `Descricao do item ${index + 1}`, 5000),
      unidade: requireText(item.unidade, `Unidade do item ${index + 1}`, 50),
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: quantidade * valorUnitario,
    } satisfies LicitacaoItem;
  });

  const fullLicitacao: Licitacao = {
    ...licitacao,
    ano,
    orgao,
    numero_pregao: numeroPregao,
    id: licId,
    created_at: isNew ? now : (licitacao as Partial<Licitacao>).created_at || now,
    updated_at: now,
    valor_total_ganho: normalizedItems
      .filter((item) => item.status === 'ganho')
      .reduce((sum, item) => sum + item.quantidade * item.valor_unitario, 0),
  };

  const supabase = createSupabaseAdminClient();
  let removedItemIds: string[] = [];

  if (!isNew) {
    const { data: existingLicitacao, error: existingLicitacaoError } = await supabase
      .from('licitacoes')
      .select('observacoes')
      .eq('id', licId)
      .maybeSingle();
    if (existingLicitacaoError) throw existingLicitacaoError;
    fullLicitacao.observacoes = preserveCommercialContactMarkers(
      fullLicitacao.observacoes,
      existingLicitacao?.observacoes
    );

    const { data: existingItems, error: existingItemsError } = await supabase
      .from('licitacao_itens')
      .select('id')
      .eq('licitacao_id', licId);
    if (existingItemsError) throw existingItemsError;

    removedItemIds = (existingItems || [])
      .map((item) => item.id as string)
      .filter((id) => !seenItemIds.has(id));

    if (removedItemIds.length > 0) {
      const { count, error: usageError } = await supabase
        .from('empenho_itens')
        .select('id', { count: 'exact', head: true })
        .in('licitacao_item_id', removedItemIds);
      if (usageError) throw usageError;
      if ((count || 0) > 0) {
        throw new RequestError(
          'Nao e possivel remover itens que ja possuem empenhos. Mantenha o item e ajuste seu status.',
          409
        );
      }
    }
  }

  const { error: licError } = await supabase
    .from('licitacoes')
    .upsert(getLicitacaoPayload(fullLicitacao));

  if (licError) throw licError;

  const { error: itemsError } = await supabase
      .from('licitacao_itens')
      .upsert(normalizedItems.map(withoutGeneratedTotal));
  if (itemsError) throw itemsError;

  if (removedItemIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('licitacao_itens')
      .delete()
      .in('id', removedItemIds);
    if (deleteError) throw deleteError;
  }

  return { ...fullLicitacao, itens: normalizedItems };
}

async function duplicateLicitacao(id: string) {
  const original = await getLicitacao(id);
  if (!original) throw new Error('Licitacao nao encontrada');

  const now = new Date().toISOString();
  const duplicatedLicitacao: Licitacao = {
    ...original,
    id: crypto.randomUUID(),
    numero_pregao: `${original.numero_pregao} (Copia)`,
    status: 'em_andamento',
    created_at: now,
    updated_at: now,
  };

  const duplicatedItems = (original.itens || []).map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    licitacao_id: duplicatedLicitacao.id,
  }));

  const supabase = createSupabaseAdminClient();
  const { error: licError } = await supabase
    .from('licitacoes')
    .insert(getLicitacaoPayload(duplicatedLicitacao));
  if (licError) throw licError;

  if (duplicatedItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('licitacao_itens')
      .insert(duplicatedItems.map(withoutGeneratedTotal));
    if (itemsError) throw itemsError;
  }

  return { ...duplicatedLicitacao, itens: duplicatedItems };
}

async function saveEmpenho(payload: Record<string, unknown>) {
  const empenho = payload.empenho as Omit<Empenho, 'created_at' | 'updated_at'>;
  const items = (payload.items || []) as Omit<EmpenhoItem, 'id' | 'empenho_id' | 'valor_total'>[];
  if (!empenho || typeof empenho !== 'object') throw new RequestError('Invalid empenho payload.');
  if (!Array.isArray(items) || items.length === 0) throw new RequestError('At least one empenho item is required.');
  if (!empenhoStatuses.has(empenho.status)) throw new RequestError('Invalid empenho status.');

  const licitacaoId = requireText(empenho.licitacao_id, 'Licitacao', 100);
  const numeroEmpenho = requireText(empenho.numero_empenho, 'Numero do empenho', 100);
  const dataEmpenho = requireText(empenho.data_empenho, 'Data do empenho', 10);
  const isNew = !empenho.id || empenho.id === '';
  const empId = isNew ? crypto.randomUUID() : empenho.id;
  const now = new Date().toISOString();
  const requestedItemIds = items.map((item) => requireText(item.licitacao_item_id, 'Item da licitacao', 100));

  const supabase = createSupabaseAdminClient();
  const targetDocumentKey = normalizeHalexDocument(numeroEmpenho);
  const existingEmpenhos = await fetchAllSupabaseRows((from, to) => supabase
    .from('empenhos')
    .select('id, numero_empenho')
    .eq('licitacao_id', licitacaoId)
    .order('id', { ascending: true })
    .range(from, to));
  const duplicate = existingEmpenhos.find((item) => (
    item.id !== empId && normalizeHalexDocument(String(item.numero_empenho || '')) === targetDocumentKey
  ));
  if (duplicate) {
    throw new RequestError(`Este empenho/NF (${numeroEmpenho}) ja existe neste pregao.`, 409);
  }

  const { data: licitacao, error: licitacaoError } = await supabase
    .from('licitacoes')
    .select('data_vencimento')
    .eq('id', licitacaoId)
    .maybeSingle();
  if (licitacaoError) throw licitacaoError;
  if (!licitacao) throw new RequestError('Licitacao nao encontrada.', 404);
  if (isAfterContractExpiration(dataEmpenho, licitacao.data_vencimento as string | null)) {
    throw new RequestError('Nao e possivel lancar pedido depois do vencimento do contrato.', 409);
  }

  const licitacaoItems = await fetchAllSupabaseRows((from, to) => supabase
    .from('licitacao_itens')
    .select('id, licitacao_id, numero_item, descricao, quantidade, valor_unitario, status, codigo_produto')
    .eq('licitacao_id', licitacaoId)
    .order('id', { ascending: true })
    .range(from, to));

  const allLicitacaoItems = licitacaoItems as unknown as LicitacaoItemRow[];
  const itemById = new Map(allLicitacaoItems.map((item) => [item.id, item]));
  for (const itemId of requestedItemIds) {
    const item = itemById.get(itemId);
    if (!item) throw new RequestError('One or more licitacao items were not found.');
    if (item.status !== 'ganho') throw new RequestError('Only won items can receive empenhos.');
  }

  const activeEmpenhos = await fetchAllSupabaseRows((from, to) => supabase
    .from('empenhos')
    .select('id')
    .eq('licitacao_id', licitacaoId)
    .neq('status', 'cancelado')
    .neq('id', empId)
    .order('id', { ascending: true })
    .range(from, to));

  const activeIds = activeEmpenhos.map((item) => item.id as string);
  const committedByItem = new Map<string, number>();
  for (const ids of chunk(activeIds, 500)) {
    const committedItems = await fetchAllSupabaseRows((from, to) => supabase
      .from('empenho_itens')
      .select('id, licitacao_item_id, quantidade_empenhada')
      .in('empenho_id', ids)
      .order('id', { ascending: true })
      .range(from, to));
    for (const item of committedItems) {
      const itemId = item.licitacao_item_id as string;
      committedByItem.set(itemId, (committedByItem.get(itemId) || 0) + Number(item.quantidade_empenhada));
    }
  }

  const pendingByItem = new Map<string, number>();
  const allocationByItem = new Map<string, {
    licitacao_item_id: string;
    quantidade_empenhada: number;
    valor_unitario: number;
  }>();

  const availableForItem = (item: LicitacaoItemRow) => (
    Number(item.quantidade)
      - (committedByItem.get(item.id) || 0)
      - (pendingByItem.get(item.id) || 0)
  );

  const allocateFromCandidates = (
    candidates: LicitacaoItemRow[],
    remainingQuantity: number
  ) => {
    let remaining = remainingQuantity;
    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const available = availableForItem(candidate);
      if (available <= 0) continue;

      const allocated = Math.min(remaining, available);
      const current = allocationByItem.get(candidate.id);
      allocationByItem.set(candidate.id, {
        licitacao_item_id: candidate.id,
        quantidade_empenhada: (current?.quantidade_empenhada || 0) + allocated,
        valor_unitario: Number(candidate.valor_unitario),
      });
      pendingByItem.set(candidate.id, (pendingByItem.get(candidate.id) || 0) + allocated);
      remaining -= allocated;
    }
    return remaining;
  };

  items.forEach((item, index) => {
    const itemId = requestedItemIds[index];
    const sourceItem = itemById.get(itemId);
    if (!sourceItem) throw new RequestError('Licitacao item not found.');
    const quantidade = requirePositiveInteger(item.quantidade_empenhada, `Quantidade empenhada do item ${index + 1}`);
    const equivalentItems = allLicitacaoItems
      .filter((candidate) => areEquivalentLicitacaoItems(sourceItem, candidate))
      .sort((a, b) => {
        if (a.id === itemId) return -1;
        if (b.id === itemId) return 1;
        return (a.numero_item || 0) - (b.numero_item || 0);
      });

    let remaining = allocateFromCandidates(equivalentItems, quantidade);

    if (remaining > 0) {
      const equivalentIds = new Set(equivalentItems.map((candidate) => candidate.id));
      const sameProductItems = allLicitacaoItems
        .filter((candidate) => (
          !equivalentIds.has(candidate.id)
          && areSameProductLicitacaoItems(sourceItem, candidate)
          && availableForItem(candidate) > 0
        ))
        .sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));

      remaining = allocateFromCandidates(sameProductItems, remaining);
    }

    if (remaining > 0) {
      const alreadyTriedIds = new Set(
        allLicitacaoItems
          .filter((candidate) => (
            areEquivalentLicitacaoItems(sourceItem, candidate)
            || areSameProductLicitacaoItems(sourceItem, candidate)
          ))
          .map((candidate) => candidate.id)
      );
      const samePriceFallbackItems = allLicitacaoItems
        .filter((candidate) => (
          !alreadyTriedIds.has(candidate.id)
          && canFallbackToSamePriceItem(sourceItem, candidate)
          && availableForItem(candidate) > 0
        ))
        .sort((a, b) => (a.numero_item || 0) - (b.numero_item || 0));

      remaining = allocateFromCandidates(samePriceFallbackItems, remaining);
    }

    if (remaining > 0) {
      const emergencyFallbackItems = allLicitacaoItems
        .filter((candidate) => (
          candidate.licitacao_id === sourceItem.licitacao_id
          && candidate.status === 'ganho'
          && availableForItem(candidate) > 0
        ))
        .sort((a, b) => {
          const priceDistance = Math.abs(Number(a.valor_unitario || 0) - Number(sourceItem.valor_unitario || 0))
            - Math.abs(Number(b.valor_unitario || 0) - Number(sourceItem.valor_unitario || 0));
          if (priceDistance !== 0) return priceDistance;
          return (a.numero_item || 0) - (b.numero_item || 0);
        });

      remaining = allocateFromCandidates(emergencyFallbackItems, remaining);
    }

    if (remaining > 0) {
      const totalAvailableInPregao = allLicitacaoItems
        .filter((candidate) => (
          candidate.licitacao_id === sourceItem.licitacao_id
          && candidate.status === 'ganho'
        ))
        .reduce((sum, candidate) => sum + Math.max(0, availableForItem(candidate)), 0);
      throw new RequestError(
        `Quantidade do item ${index + 1} excede o saldo disponivel no pregao. Saldo restante: ${totalAvailableInPregao}.`,
        409
      );
    }
  });

  const normalizedItems = Array.from(allocationByItem.values()).map((item) => {
    return {
      id: crypto.randomUUID(),
      empenho_id: empId,
      licitacao_item_id: item.licitacao_item_id,
      quantidade_empenhada: item.quantidade_empenhada,
      valor_unitario: item.valor_unitario,
      valor_total: item.quantidade_empenhada * item.valor_unitario,
    };
  });

  const fullEmpenho: Empenho = {
    ...empenho,
    licitacao_id: licitacaoId,
    numero_empenho: numeroEmpenho,
    data_empenho: dataEmpenho,
    id: empId,
    valor_empenho: normalizedItems.reduce((sum, item) => sum + item.valor_total, 0),
    created_at: isNew ? now : (empenho as Partial<Empenho>).created_at || now,
    updated_at: now,
  };

  const { error: empError } = await supabase
    .from('empenhos')
    .upsert({
      id: fullEmpenho.id,
      licitacao_id: fullEmpenho.licitacao_id,
      numero_empenho: fullEmpenho.numero_empenho,
      data_empenho: fullEmpenho.data_empenho,
      orgao: fullEmpenho.orgao,
      valor_empenho: fullEmpenho.valor_empenho,
      status: fullEmpenho.status,
      observacoes: fullEmpenho.observacoes,
      created_at: fullEmpenho.created_at,
      updated_at: fullEmpenho.updated_at,
    });

  if (empError) throw empError;

  if (!isNew) {
    const { error: deleteError } = await supabase
      .from('empenho_itens')
      .delete()
      .eq('empenho_id', empId);
    if (deleteError) throw deleteError;
  }

  if (normalizedItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('empenho_itens')
      .insert(normalizedItems.map(withoutGeneratedTotal));
    if (itemsError) {
      if (isNew) await supabase.from('empenhos').delete().eq('id', empId);
      throw itemsError;
    }
  }

  return { ...fullEmpenho, itens: normalizedItems };
}

async function saveBulkEmpenhos(payload: Record<string, unknown>): Promise<BulkEmpenhoImportResult> {
  const entries = payload.entries as BulkEmpenhoImportEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RequestError('Nenhum empenho foi enviado para importação.');
  }
  if (entries.length > 100) {
    throw new RequestError('Envie no máximo 100 empenhos por lote.', 413);
  }

  const clientCodes = new Set(
    entries.map((entry) => normalizeHalexIdentifier(entry.codigoCliente)).filter(Boolean)
  );
  const supabase = createSupabaseAdminClient();
  const { data: licitacoes, error: licitacoesError } = await supabase
    .from('licitacoes')
    .select('id,codigo_cliente,orgao,data_vencimento');
  if (licitacoesError) throw licitacoesError;

  const relevantLicitacoes = (licitacoes || []).filter(
    (licitacao) => clientCodes.has(normalizeHalexIdentifier(licitacao.codigo_cliente))
  );
  const licitacaoById = new Map(relevantLicitacoes.map((licitacao) => [licitacao.id as string, licitacao]));
  const relevantIds = relevantLicitacoes.map((licitacao) => licitacao.id as string);
  const selectedLicitacaoIds = Array.from(new Set(entries.map((entry) => entry.licitacaoId).filter(Boolean)));
  const existingDocuments = new Set<string>();

  for (const ids of chunk(relevantIds, 500)) {
    const existingEmpenhos = await fetchAllSupabaseRows((from, to) => supabase
      .from('empenhos')
      .select('id,licitacao_id,numero_empenho')
      .in('licitacao_id', ids)
      .order('id', { ascending: true })
      .range(from, to));

    for (const empenho of existingEmpenhos) {
      const licitacao = licitacaoById.get(empenho.licitacao_id as string);
      if (!licitacao) continue;
      existingDocuments.add(
        `${normalizeHalexIdentifier(licitacao.codigo_cliente)}|${normalizeHalexDocument(empenho.numero_empenho)}`
      );
    }
  }

  const requestedItemIds = Array.from(new Set(
    entries.flatMap((entry) => Array.isArray(entry.items)
      ? entry.items.map((item) => item.licitacaoItemId).filter(Boolean)
      : [])
  ));
  const licitacaoItems: Array<{
    id: string;
    licitacao_id: string;
    quantidade: number;
    valor_unitario: number;
    status: string;
  }> = [];

  for (const ids of chunk(requestedItemIds, 500)) {
    const { data, error } = await supabase
      .from('licitacao_itens')
      .select('id,licitacao_id,quantidade,valor_unitario,status')
      .in('id', ids);
    if (error) throw error;
    licitacaoItems.push(...((data || []) as typeof licitacaoItems));
  }
  const itemById = new Map(licitacaoItems.map((item) => [item.id, item]));

  const activeEmpenhoIds: string[] = [];
  for (const ids of chunk(selectedLicitacaoIds, 500)) {
    const data = await fetchAllSupabaseRows((from, to) => supabase
      .from('empenhos')
      .select('id')
      .in('licitacao_id', ids)
      .neq('status', 'cancelado')
      .order('id', { ascending: true })
      .range(from, to));
    activeEmpenhoIds.push(...data.map((item) => item.id as string));
  }

  const committedByItem = new Map<string, number>();
  const requestedItemIdSet = new Set(requestedItemIds);
  for (const ids of chunk(activeEmpenhoIds, 500)) {
    const data = await fetchAllSupabaseRows((from, to) => supabase
      .from('empenho_itens')
      .select('id,licitacao_item_id,quantidade_empenhada')
      .in('empenho_id', ids)
      .order('id', { ascending: true })
      .range(from, to));
    for (const item of data) {
      const itemId = item.licitacao_item_id as string;
      if (!requestedItemIdSet.has(itemId)) continue;
      committedByItem.set(
        itemId,
        (committedByItem.get(itemId) || 0) + Number(item.quantidade_empenhada)
      );
    }
  }

  const result: BulkEmpenhoImportResult = { imported: [], duplicates: [], failed: [] };
  const pendingByItem = new Map<string, number>();
  const empenhosToInsert: Array<Record<string, unknown>> = [];
  const itemsToInsert: Array<Record<string, unknown>> = [];
  const insertedEmpenhoIds: string[] = [];
  const now = new Date().toISOString();

  for (const entry of entries) {
    const key = typeof entry?.key === 'string' ? entry.key : '';
    try {
      const licitacaoId = requireText(entry?.licitacaoId, 'Pregão', 100);
      const codigoCliente = requireText(entry?.codigoCliente, 'Código do cliente', 100);
      const numeroEmpenho = requireText(entry?.numeroEmpenho, 'Número da NF', 100);
      const dataEmpenho = requireText(entry?.dataEmpenho, 'Data de lançamento', 10);
      const licitacao = licitacaoById.get(licitacaoId);
      if (licitacao && isAfterContractExpiration(dataEmpenho, licitacao.data_vencimento as string | null)) {
        throw new RequestError('Contrato vencido na data da NF. Nao e possivel lancar novo pedido.', 409);
      }
      if (!licitacao) throw new RequestError('Pregão selecionado não pertence ao cliente informado.', 409);
      if (
        normalizeHalexIdentifier(licitacao.codigo_cliente)
        !== normalizeHalexIdentifier(codigoCliente)
      ) {
        throw new RequestError('Código do cliente não corresponde ao pregão selecionado.', 409);
      }

      const documentKey = `${normalizeHalexIdentifier(codigoCliente)}|${normalizeHalexDocument(numeroEmpenho)}`;
      if (existingDocuments.has(documentKey)) {
        result.duplicates.push(key);
        continue;
      }

      if (!Array.isArray(entry.items) || entry.items.length === 0) {
        throw new RequestError('NF sem itens mapeados.');
      }

      const seenItemIds = new Set<string>();
      const normalizedItems = entry.items.map((item, index) => {
        const itemId = requireText(item?.licitacaoItemId, `Item ${index + 1}`, 100);
        if (seenItemIds.has(itemId)) throw new RequestError('O mesmo item foi mapeado duas vezes na NF.');
        seenItemIds.add(itemId);

        const sourceItem = itemById.get(itemId);
        if (!sourceItem || sourceItem.licitacao_id !== licitacaoId) {
          throw new RequestError(`Item ${index + 1} não pertence ao pregão selecionado.`, 409);
        }
        if (sourceItem.status !== 'ganho') {
          throw new RequestError(`Item ${index + 1} não está marcado como ganho.`, 409);
        }

        const quantidade = requirePositiveInteger(item.quantidade, `Quantidade do item ${index + 1}`);
        const available = Number(sourceItem.quantidade)
          - (committedByItem.get(itemId) || 0)
          - (pendingByItem.get(itemId) || 0);
        if (quantidade > available) {
          throw new RequestError(
            `Quantidade do item ${index + 1} excede o saldo disponível de ${Math.max(0, available)}.`,
            409
          );
        }

        return {
          itemId,
          quantidade,
          valorUnitario: Number(sourceItem.valor_unitario),
        };
      });

      const empenhoId = crypto.randomUUID();
      normalizedItems.forEach((item) => {
        pendingByItem.set(item.itemId, (pendingByItem.get(item.itemId) || 0) + item.quantidade);
        itemsToInsert.push({
          id: crypto.randomUUID(),
          empenho_id: empenhoId,
          licitacao_item_id: item.itemId,
          quantidade_empenhada: item.quantidade,
          valor_unitario: item.valorUnitario,
        });
      });

      empenhosToInsert.push({
        id: empenhoId,
        licitacao_id: licitacaoId,
        numero_empenho: numeroEmpenho,
        data_empenho: dataEmpenho,
        orgao: entry.orgao || licitacao.orgao || null,
        valor_empenho: normalizedItems.reduce(
          (sum, item) => sum + item.quantidade * item.valorUnitario,
          0
        ),
        status: 'ativo',
        observacoes: [
          `Importação em lote Halex com ${entry.items.length} item(ns).`,
          entry.ordemVenda ? `Ordem de venda: ${entry.ordemVenda}.` : '',
          entry.dataFaturamento ? `Faturamento: ${entry.dataFaturamento}.` : '',
        ].filter(Boolean).join(' '),
        created_at: now,
        updated_at: now,
      });

      existingDocuments.add(documentKey);
      result.imported.push(key);
    } catch (error) {
      result.failed.push({
        key,
        message: error instanceof Error ? error.message : 'Falha ao importar NF.',
      });
    }
  }

  try {
    for (const batch of chunk(empenhosToInsert, 500)) {
      const { error } = await supabase.from('empenhos').insert(batch);
      if (error) throw error;
      insertedEmpenhoIds.push(...batch.map((item) => item.id as string));
    }
    for (const batch of chunk(itemsToInsert, 500)) {
      const { error } = await supabase.from('empenho_itens').insert(batch);
      if (error) throw error;
    }
  } catch (error) {
    for (const ids of chunk(insertedEmpenhoIds, 500)) {
      await supabase.from('empenhos').delete().in('id', ids);
    }
    throw error;
  }

  return result;
}

async function importBackup(payload: Record<string, unknown>) {
  if (payload.confirmReplace !== true) {
    throw new RequestError('Backup replacement confirmation is required.');
  }
  const data = payload.data as {
    licitacoes: Licitacao[];
    itens: LicitacaoItem[];
    empenhos: Empenho[];
    empenhoItens: EmpenhoItem[];
    productCatalog?: ProductCatalogItem[];
    commercialContacts?: CommercialContact[];
    commercialOpportunities?: CommercialOpportunity[];
    commercialTasks?: CommercialTask[];
    auditEvents?: AuditEvent[];
  };
  if (
    !data ||
    !Array.isArray(data.licitacoes) ||
    !Array.isArray(data.itens) ||
    !Array.isArray(data.empenhos) ||
    !Array.isArray(data.empenhoItens)
  ) {
    throw new RequestError('Invalid backup structure.');
  }
  if (
    data.licitacoes.length > 100_000 ||
    data.itens.length > 500_000 ||
    data.empenhos.length > 500_000 ||
    data.empenhoItens.length > 1_000_000
  ) {
    throw new RequestError('Backup exceeds supported record limits.', 413);
  }

  const supabase = createSupabaseAdminClient();
  const ensure = (error: { message?: string } | null) => {
    if (error) throw new Error(error.message || 'Backup operation failed.');
  };

  ensure((await supabase.from('empenho_itens').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('commercial_contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('commercial_opportunities').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('commercial_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('audit_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('empenhos').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('licitacao_itens').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('licitacoes').delete().neq('id', '00000000-0000-0000-0000-000000000000')).error);
  ensure((await supabase.from('product_catalog').delete().neq('codigo_produto', '')).error);

  if (data.licitacoes.length) ensure((await supabase.from('licitacoes').insert(data.licitacoes.map(getLicitacaoPayload))).error);
  if (data.itens.length) ensure((await supabase.from('licitacao_itens').insert(data.itens.map(withoutGeneratedTotal))).error);
  if (data.empenhos.length) ensure((await supabase.from('empenhos').insert(data.empenhos)).error);
  if (data.empenhoItens.length) ensure((await supabase.from('empenho_itens').insert(data.empenhoItens.map(withoutGeneratedTotal))).error);
  if (data.productCatalog?.length) ensure((await supabase.from('product_catalog').insert(data.productCatalog)).error);
  if (data.commercialContacts?.length) ensure((await supabase.from('commercial_contacts').insert(data.commercialContacts)).error);
  if (data.commercialOpportunities?.length) ensure((await supabase.from('commercial_opportunities').insert(data.commercialOpportunities)).error);
  if (data.commercialTasks?.length) ensure((await supabase.from('commercial_tasks').insert(data.commercialTasks)).error);
  if (data.auditEvents?.length) ensure((await supabase.from('audit_events').insert(data.auditEvents)).error);
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedRequest();
  if (!session) {
    return makeError('Unauthorized.', 401);
  }

  if (!isSupabaseAdminConfigured()) {
    return makeError('Supabase is not configured on this deployment.', 500);
  }

  const body = (await request.json().catch(() => null)) as DataRequest | null;
  if (!body?.action) return makeError('Missing data action.');

  if (adminOnlyActions.has(body.action) && session.role !== 'admin') {
    return makeError('Viewer accounts cannot change data.', 403);
  }

  try {
    if (adminOnlyActions.has(body.action)) requireSameOrigin(request);
    const supabase = createSupabaseAdminClient();
    const payload = body.payload || {};

    switch (body.action) {
      case 'getAppData': {
        const [licitacoes, itens, empenhos, empenhoItens, contacts, opportunities, tasks] = await Promise.all([
          fetchAllSupabaseRows((from, to) => supabase.from('licitacoes').select(licitacaoListColumns).order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('licitacao_itens').select('*').order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('empenhos').select('*').order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('empenho_itens').select('*').order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_contacts').select('*').order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_opportunities').select('*').order('id', { ascending: true }).range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_tasks').select('*').order('id', { ascending: true }).range(from, to)),
        ]);
        return ok({
          licitacoes: mergeCommercialRecordsIntoLicitacoes(
            licitacoes as unknown as Licitacao[],
            contacts as CommercialContact[],
            opportunities as CommercialOpportunity[],
            tasks as CommercialTask[]
          ),
          itens,
          empenhos,
          empenhoItens,
        });
      }
      case 'getLicitacoes': {
        const data = await fetchAllSupabaseRows((from, to) => supabase
          .from('licitacoes')
          .select(licitacaoListColumns)
          .order('id', { ascending: true })
          .range(from, to));
        return ok(data);
      }
      case 'getLicitacao':
        return ok(await getLicitacao(String(payload.id || '')));
      case 'getAllItens': {
        const data = await fetchAllSupabaseRows((from, to) => supabase
          .from('licitacao_itens')
          .select('*')
          .order('id', { ascending: true })
          .range(from, to));
        return ok(data);
      }
      case 'saveLicitacao':
        return ok(await saveLicitacao(payload));
      case 'deleteLicitacao': {
        const { error } = await supabase.from('licitacoes').delete().eq('id', String(payload.id || ''));
        if (error) throw error;
        return ok();
      }
      case 'duplicateLicitacao':
        return ok(await duplicateLicitacao(String(payload.id || '')));
      case 'attachEdital': {
        const attachment = validateAttachment(payload.edital);
        const { error } = await supabase
          .from('licitacoes')
          .update({ edital: attachment })
          .eq('id', String(payload.licitacaoId || ''));
        if (error) throw error;
        return ok();
      }
      case 'getEdital': {
        const { data, error } = await supabase
          .from('licitacoes')
          .select('edital')
          .eq('id', String(payload.licitacaoId || ''))
          .maybeSingle();
        if (error) throw error;
        return ok(data?.edital || null);
      }
      case 'attachAta': {
        const attachment = validateAttachment(payload.ata);
        const { error } = await supabase
          .from('licitacoes')
          .update({ ata: attachment })
          .eq('id', String(payload.licitacaoId || ''));
        if (error) throw error;
        return ok();
      }
      case 'getAta': {
        const { data, error } = await supabase
          .from('licitacoes')
          .select('ata')
          .eq('id', String(payload.licitacaoId || ''))
          .maybeSingle();
        if (error) throw error;
        return ok(data?.ata || null);
      }
      case 'exportBackup': {
        const [licitacoes, itens, empenhos, empenhoItens, productCatalog, commercialContacts, commercialOpportunities, commercialTasks, auditEvents] = await Promise.all([
          fetchAllSupabaseRows((from, to) => supabase.from('licitacoes').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('licitacao_itens').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('empenhos').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('empenho_itens').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('product_catalog').select('*').order('codigo_produto').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_contacts').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_opportunities').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('commercial_tasks').select('*').order('id').range(from, to)),
          fetchAllSupabaseRows((from, to) => supabase.from('audit_events').select('*').order('id').range(from, to)),
        ]);
        return privateJson({
          ok: true,
          data: {
            licitacoes,
            itens,
            empenhos,
            empenhoItens,
            productCatalog,
            commercialContacts,
            commercialOpportunities,
            commercialTasks,
            auditEvents,
          },
        });
      }
      case 'importBackup':
        await importBackup(payload);
        return ok();
      case 'getProductCatalog': {
        const data = await fetchAllSupabaseRows((from, to) => supabase
          .from('product_catalog')
          .select('*')
          .order('codigo_produto', { ascending: true })
          .range(from, to));
        return ok(data);
      }
      case 'saveProductCatalog': {
        const items = (payload.items || []) as ProductCatalogItem[];
        await supabase.from('product_catalog').delete().neq('codigo_produto', '');
        if (items.length > 0) {
          const { error } = await supabase.from('product_catalog').insert(items);
          if (error) throw error;
        }
        return ok();
      }
      case 'getAuditEvents': {
        const limit = Math.min(200, Math.max(1, Number(payload.limit || 50)));
        let query = supabase
          .from('audit_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (typeof payload.actionPrefix === 'string' && payload.actionPrefix.trim()) {
          query = query.ilike('action', `${payload.actionPrefix.trim()}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        return ok(data || []);
      }
      case 'getEmpenhos': {
        const licitacaoId = payload.licitacaoId ? String(payload.licitacaoId) : null;
        const data = await fetchAllSupabaseRows((from, to) => {
          let query = supabase.from('empenhos').select('*');
          if (licitacaoId) query = query.eq('licitacao_id', licitacaoId);
          return query.order('id', { ascending: true }).range(from, to);
        });
        return ok(data.sort((a, b) => String(b.data_empenho).localeCompare(String(a.data_empenho))));
      }
      case 'getEmpenho': {
        const { data: empenho, error: empError } = await supabase
          .from('empenhos')
          .select('*')
          .eq('id', String(payload.id || ''))
          .maybeSingle();
        if (empError) throw empError;
        if (!empenho) return ok(null);

        const { data: itens, error: itensError } = await supabase
          .from('empenho_itens')
          .select('*')
          .eq('empenho_id', String(payload.id || ''));
        if (itensError) throw itensError;
        return ok({ ...empenho, itens: itens || [] });
      }
      case 'saveEmpenho':
        return ok(await saveEmpenho(payload));
      case 'saveBulkEmpenhos': {
        const result = await saveBulkEmpenhos(payload);
        await writeAudit(
          supabase,
          session,
          'import.bulk_empenhos',
          'empenho',
          null,
          `Importacao em lote: ${result.imported.length} NF(s) importadas, ${result.duplicates.length} duplicada(s), ${result.failed.length} falha(s).`,
          {
            imported: result.imported.length,
            duplicates: result.duplicates.length,
            failed: result.failed.length,
          }
        );
        return ok(result);
      }
      case 'deleteEmpenho': {
        const empenhoId = requireText(payload.id, 'Empenho', 100);
        const { error: itemError } = await supabase
          .from('empenho_itens')
          .delete()
          .eq('empenho_id', empenhoId);
        if (itemError) throw itemError;

        const { error } = await supabase.from('empenhos').delete().eq('id', empenhoId);
        if (error) throw error;
        return ok();
      }
      case 'deleteEmpenhosByLicitacao': {
        const licitacaoId = requireText(payload.licitacaoId, 'Licitacao', 100);
        const { data: existingEmpenhos, error: existingError } = await supabase
          .from('empenhos')
          .select('id')
          .eq('licitacao_id', licitacaoId);
        if (existingError) throw existingError;

        const empenhoIds = (existingEmpenhos || []).map((item) => item.id as string);
        if (empenhoIds.length === 0) return ok(0);

        for (const ids of chunk(empenhoIds, 500)) {
          const { error: itemError } = await supabase
            .from('empenho_itens')
            .delete()
            .in('empenho_id', ids);
          if (itemError) throw itemError;
        }

        let deletedCount = 0;
        for (const ids of chunk(empenhoIds, 500)) {
          const { data, error } = await supabase
            .from('empenhos')
            .delete()
            .in('id', ids)
            .select('id');
          if (error) throw error;
          deletedCount += data?.length || 0;
        }

        return ok(deletedCount);
      }
      case 'getAllEmpenhoItens': {
        const data = await fetchAllSupabaseRows((from, to) => supabase
          .from('empenho_itens')
          .select('*')
          .order('id', { ascending: true })
          .range(from, to));
        return ok(data);
      }
      case 'saveCommercialContact': {
        const licitacaoId = requireText(payload.licitacaoId, 'Licitação', 100);
        const clientKey = requireText(payload.clientKey, 'Cliente', 500);
        const contactedAt = requireText(payload.contactedAt, 'Data do contato', 10);
        const outcome = payload.outcome as CommercialContactOutcome;
        if (!commercialContactOutcomes.has(outcome)) throw new RequestError('Resultado do contato inválido.');

        const { data: licitacao, error: licitacaoError } = await supabase
          .from('licitacoes')
          .select('id,orgao,codigo_cliente,observacoes')
          .eq('id', licitacaoId)
          .maybeSingle();
        if (licitacaoError) throw licitacaoError;
        if (!licitacao) throw new RequestError('Licitação do cliente não encontrada.', 404);
        if (commercialClientKey(licitacao) !== clientKey) {
          throw new RequestError('A licitação selecionada não pertence a este cliente.', 409);
        }

        const contact: CommercialContact = {
          id: crypto.randomUUID(),
          client_key: clientKey,
          licitacao_id: licitacaoId,
          contacted_at: contactedAt.slice(0, 10),
          outcome,
          notes: typeof payload.notes === 'string' && payload.notes.trim()
            ? payload.notes.trim().slice(0, 2000)
            : null,
          next_contact_at: typeof payload.nextContactAt === 'string' && payload.nextContactAt
            ? payload.nextContactAt.slice(0, 10)
            : null,
          created_by: session.displayName || session.username,
          created_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('commercial_contacts').upsert(contact);
        if (error) throw error;
        await writeAudit(supabase, session, 'commercial_contact.saved', 'commercial_contact', contact.id, `Contato registrado para ${licitacao.orgao}.`, { outcome });
        return ok(contact);
      }
      case 'saveCommercialOpportunity': {
        const licitacaoId = requireText(payload.licitacaoId, 'Licitação', 100);
        const clientKey = requireText(payload.clientKey, 'Cliente', 500);
        const stage = payload.stage as CommercialPipelineStage;
        if (!commercialPipelineStages.has(stage)) throw new RequestError('Etapa comercial inválida.');
        const { data: licitacao, error: fetchError } = await supabase
          .from('licitacoes')
          .select('id,orgao,codigo_cliente,observacoes')
          .eq('id', licitacaoId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!licitacao) throw new RequestError('Licitação do cliente não encontrada.', 404);
        if (commercialClientKey(licitacao) !== clientKey) throw new RequestError('Cliente inválido.', 409);
        const now = new Date().toISOString();
        const opportunity: CommercialOpportunity = {
          id: typeof payload.id === 'string' && payload.id ? payload.id : crypto.randomUUID(),
          client_key: clientKey,
          licitacao_id: licitacaoId,
          title: requireText(payload.title, 'Título', 180),
          stage,
          estimated_value: requireNonNegativeNumber(payload.estimatedValue, 'Valor estimado'),
          probability: Math.max(0, Math.min(100, requireNonNegativeNumber(payload.probability, 'Probabilidade'))),
          owner: typeof payload.owner === 'string' && payload.owner.trim() ? payload.owner.trim().slice(0, 120) : null,
          expected_close_at: typeof payload.expectedCloseAt === 'string' && payload.expectedCloseAt ? payload.expectedCloseAt.slice(0, 10) : null,
          notes: typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim().slice(0, 2000) : null,
          created_by: typeof payload.createdBy === 'string' && payload.createdBy ? payload.createdBy : session.displayName || session.username,
          created_at: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : now,
          updated_at: now,
        };
        const { error } = await supabase.from('commercial_opportunities').upsert(opportunity);
        if (error) throw error;
        await writeAudit(supabase, session, 'commercial_opportunity.saved', 'commercial_opportunity', opportunity.id, `Oportunidade atualizada: ${opportunity.title}.`, { stage, estimatedValue: opportunity.estimated_value });
        return ok(opportunity);
      }
      case 'saveCommercialTask': {
        const licitacaoId = requireText(payload.licitacaoId, 'Licitação', 100);
        const clientKey = requireText(payload.clientKey, 'Cliente', 500);
        const type = payload.type as CommercialTaskType;
        const status = payload.status as CommercialTaskStatus;
        if (!commercialTaskTypes.has(type)) throw new RequestError('Tipo de tarefa inválido.');
        if (!commercialTaskStatuses.has(status)) throw new RequestError('Status da tarefa inválido.');
        const { data: licitacao, error: fetchError } = await supabase
          .from('licitacoes')
          .select('id,orgao,codigo_cliente,observacoes')
          .eq('id', licitacaoId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!licitacao) throw new RequestError('Licitação do cliente não encontrada.', 404);
        if (commercialClientKey(licitacao) !== clientKey) throw new RequestError('Cliente inválido.', 409);
        const now = new Date().toISOString();
        const task: CommercialTask = {
          id: typeof payload.id === 'string' && payload.id ? payload.id : crypto.randomUUID(),
          client_key: clientKey,
          licitacao_id: licitacaoId,
          title: requireText(payload.title, 'Título', 180),
          type,
          due_at: requireText(payload.dueAt, 'Prazo', 10).slice(0, 10),
          status,
          owner: typeof payload.owner === 'string' && payload.owner.trim() ? payload.owner.trim().slice(0, 120) : null,
          notes: typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim().slice(0, 2000) : null,
          completed_at: status === 'concluida'
            ? (typeof payload.completedAt === 'string' && payload.completedAt ? payload.completedAt : now)
            : null,
          created_by: typeof payload.createdBy === 'string' && payload.createdBy ? payload.createdBy : session.displayName || session.username,
          created_at: typeof payload.createdAt === 'string' && payload.createdAt ? payload.createdAt : now,
          updated_at: now,
        };
        const { error } = await supabase.from('commercial_tasks').upsert(task);
        if (error) throw error;
        await writeAudit(supabase, session, 'commercial_task.saved', 'commercial_task', task.id, `Tarefa atualizada: ${task.title}.`, { status, dueAt: task.due_at });
        return ok(task);
      }
      default:
        return makeError('Unsupported data action.');
    }
  } catch (error) {
    console.error(error);
    if (error instanceof RequestError) return makeError(error.message, error.status);
    return makeError(error instanceof Error ? error.message : 'Data request failed.', 500);
  }
}
