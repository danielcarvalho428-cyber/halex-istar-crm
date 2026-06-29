import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, getSessionFromToken } from '@/lib/auth';
import { isSameOriginRequest, privateJson } from '@/lib/http';
import {
  createPowerBiLicitacaoMatchSet,
  hasPowerBiLicitacaoMatch,
} from '@/lib/powerbi-import-match';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import {
  DEFAULT_HALEX_REPRESENTATIVE,
  fetchHalexPowerBiRows,
  groupHalexRows,
  HALEX_IMPORT_DEFAULT_OPENED_FROM,
} from '@/lib/powerbi-halex';
import type { Licitacao, LicitacaoItem } from '@/types';
import { fetchAllSupabaseRows } from '@/lib/supabase-pagination';

type ExistingLicitacao = Pick<Licitacao, 'codigo_cliente' | 'numero_processo' | 'numero_pregao'>;

class DateRangeError extends Error {}

function makeError(message: string, status = 400) {
  return privateJson({ ok: false, message }, { status });
}

function ok<T>(data: T) {
  return privateJson({ ok: true, data });
}

async function requireAdminRequest() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = await getSessionFromToken(token);

  if (!session) return { error: makeError('Unauthorized.', 401) };
  if (session.role !== 'admin') return { error: makeError('Viewer accounts cannot import data.', 403) };
  if (!isSupabaseAdminConfigured()) return { error: makeError('Supabase is not configured on this deployment.', 500) };

  return { session };
}

function requireIsoDate(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DateRangeError(`${label} inválida.`);
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DateRangeError(`${label} inválida.`);
  }
  return value;
}

function getDateRange(openedFromValue: unknown, openedToValue: unknown) {
  const openedFrom = requireIsoDate(
    openedFromValue || HALEX_IMPORT_DEFAULT_OPENED_FROM,
    'Data de abertura inicial'
  );
  const openedTo = requireIsoDate(
    openedToValue || new Date().toISOString().slice(0, 10),
    'Data de abertura final'
  );

  if (openedFrom > openedTo) {
    throw new DateRangeError('A data de abertura inicial não pode ser posterior à data final.');
  }

  return { openedFrom, openedTo };
}

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

export async function GET(request: Request) {
  const auth = await requireAdminRequest();
  if ('error' in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const { openedFrom, openedTo } = getDateRange(
      url.searchParams.get('openedFrom'),
      url.searchParams.get('openedTo')
    );
    const rows = await fetchHalexPowerBiRows(openedFrom, openedTo);
    const groups = groupHalexRows(rows);
    const supabase = createSupabaseAdminClient();
    const existingRows = await fetchAllSupabaseRows((from, to) => supabase
      .from('licitacoes')
      .select('id,codigo_cliente,numero_processo,numero_pregao,created_at,observacoes')
      .order('id', { ascending: true })
      .range(from, to));

    const existingKeys = createPowerBiLicitacaoMatchSet(existingRows as ExistingLicitacao[]);
    const newGroups = groups.filter((group) => !hasPowerBiLicitacaoMatch(existingKeys, group.licitacao));
    const groupedSourceRows = groups.reduce((sum, group) => sum + group.sourceRows, 0);
    const existingRecords = groups.length - newGroups.length;
    const openingDates = groups
      .map((group) => group.licitacao.data_abertura)
      .filter((date): date is string => Boolean(date))
      .sort();
    const validation = {
      existingRecords,
      newRecords: newGroups.length,
      newItems: newGroups.reduce((sum, group) => sum + group.items.length, 0),
      ignoredRows: Math.max(0, rows.length - groupedSourceRows),
      missingClientCode: groups.filter((group) => !group.licitacao.codigo_cliente).length,
      missingProcess: groups.filter((group) => !group.licitacao.numero_processo).length,
      missingExpiration: groups.filter((group) => !group.licitacao.data_vencimento).length,
      zeroValueItems: groups.reduce(
        (sum, group) => sum + group.items.filter((item) => item.valor_unitario <= 0).length,
        0
      ),
    };

    return ok({
      sourceRows: rows.length,
      licitacoes: groups.length,
      items: groups.reduce((sum, group) => sum + group.items.length, 0),
      representative: DEFAULT_HALEX_REPRESENTATIVE,
      openedFrom,
      openedTo,
      sourceOpeningMin: openingDates[0] || null,
      sourceOpeningMax: openingDates.at(-1) || null,
      validation,
      sample: groups.slice(0, 8).map((group) => ({
        orgao: group.licitacao.orgao,
        numero_pregao: group.licitacao.numero_pregao,
        numero_processo: group.licitacao.numero_processo,
        data_abertura: group.licitacao.data_abertura,
        data_vencimento: group.licitacao.data_vencimento,
        items: group.items.length,
        valor_total_ganho: group.licitacao.valor_total_ganho,
        willImport: !hasPowerBiLicitacaoMatch(existingKeys, group.licitacao),
      })),
    });
  } catch (error) {
    console.error(error);
    return makeError(
      error instanceof Error ? error.message : 'Falha ao ler Power BI.',
      error instanceof DateRangeError ? 400 : 500
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return makeError('Cross-origin request blocked.', 403);
  }

  const auth = await requireAdminRequest();
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => null)) as {
      openedFrom?: string;
      openedTo?: string;
    } | null;
    const { openedFrom, openedTo } = getDateRange(body?.openedFrom, body?.openedTo);
    const rows = await fetchHalexPowerBiRows(openedFrom, openedTo);
    const groups = groupHalexRows(rows);
    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    const existingRows = await fetchAllSupabaseRows((from, to) => supabase
      .from('licitacoes')
      .select('id,codigo_cliente,numero_processo,numero_pregao,created_at,observacoes')
      .order('id', { ascending: true })
      .range(from, to));

    const existingKeys = createPowerBiLicitacaoMatchSet(existingRows as ExistingLicitacao[]);
    const newGroups = groups.filter((group) => !hasPowerBiLicitacaoMatch(existingKeys, group.licitacao));

    const licitacoes: Licitacao[] = [];
    const items: LicitacaoItem[] = [];

    newGroups.forEach((group) => {
      const licitacaoId = crypto.randomUUID();
      const licitacao: Licitacao = {
        ...group.licitacao,
        id: licitacaoId,
        created_at: now,
        updated_at: now,
      };

      licitacoes.push(licitacao);
      group.items.forEach((item, index) => {
        const numeroItem = item.numero_item || index + 1;
        items.push({
          ...item,
          id: crypto.randomUUID(),
          licitacao_id: licitacaoId,
          numero_item: numeroItem,
          valor_total: item.quantidade * item.valor_unitario,
        });
      });
    });

    const insertedLicitacaoIds: string[] = [];
    try {
      for (const batch of chunk(licitacoes, 500)) {
        const { error } = await supabase.from('licitacoes').insert(batch.map(getLicitacaoPayload));
        if (error) throw error;
        insertedLicitacaoIds.push(...batch.map((licitacao) => licitacao.id));
      }

      for (const batch of chunk(items, 500)) {
        const { error } = await supabase.from('licitacao_itens').insert(batch.map(withoutGeneratedTotal));
        if (error) throw error;
      }
    } catch (error) {
      for (const ids of chunk(insertedLicitacaoIds, 500)) {
        await supabase.from('licitacoes').delete().in('id', ids);
      }
      throw error;
    }

    return ok({
      sourceRows: rows.length,
      licitacoes: licitacoes.length,
      items: items.length,
      skippedExisting: groups.length - newGroups.length,
      representative: DEFAULT_HALEX_REPRESENTATIVE,
      openedFrom,
      openedTo,
      updatedAt: now,
    });
  } catch (error) {
    console.error(error);
    return makeError(
      error instanceof Error ? error.message : 'Falha ao importar Power BI.',
      error instanceof DateRangeError ? 400 : 500
    );
  }
}
