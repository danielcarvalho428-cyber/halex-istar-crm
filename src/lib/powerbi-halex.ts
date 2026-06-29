import type { Licitacao, LicitacaoItem } from '@/types';

const HALEX_RESOURCE_KEY = '3b57c3b5-62fe-4ae2-94f8-9812408cd401';
const HALEX_API_BASE = 'https://wabi-brazil-south-b-primary-api.analysis.windows.net';
const TOP_COUNT = 30000;
export const DEFAULT_HALEX_REPRESENTATIVE = 'PAULO ROBERTO';
export const HALEX_IMPORT_DEFAULT_OPENED_FROM = '2024-10-01';

const CARTEIRA_BY_UF: Record<string, string> = {
  GO: '4104',
  MT: '4104',
  MG: '4413',
  TO: '4648',
  PA: '4648',
  MA: '4648',
};

type PowerBiModelInfo = {
  exploration: { id: string | number };
  models: Array<{ id: string | number }>;
};

type ConceptualSchema = {
  schemas: Array<{
    schema: {
      Entities: Array<{
        Name: string;
        Properties: Array<{ Name: string }>;
      }>;
    };
  }>;
};

type DsrSchemaColumn = {
  N: string;
  T: number;
  DN?: string;
};

type DsrRow = {
  C?: unknown[];
  R?: number;
  ['Ø']?: number;
  S?: DsrSchemaColumn[];
};

type PowerBiDataSet = {
  PH: Array<{ DM0: DsrRow[] }>;
  ValueDicts?: Record<string, unknown[]>;
};

type PowerBiQueryResponse = {
  results?: Array<{
    result?: {
      data?: {
        dsr?: {
          DS?: PowerBiDataSet[];
          DataShapes?: unknown[];
        };
      };
    };
  }>;
};

export type HalexPowerBiRow = {
  cliente: string;
  uf: string | null;
  licit: string;
  edital: string | null;
  processo: string | null;
  dataAbertura: string | null;
  dataFim: string | null;
  codigoCliente: string | null;
  cnpj: string | null;
  codigoProduto: string | null;
  produto: string;
  apresentacao: string | null;
  fabricante: string | null;
  unidade: string;
  numeroItem: number | null;
  regional: string | null;
  representante: string | null;
  quantidade: number;
  valorTotal: number;
  quantidadeSaldo: number;
  valorSaldo: number;
};

export type HalexImportGroup = {
  licitacao: Omit<Licitacao, 'id' | 'created_at' | 'updated_at' | 'itens'>;
  items: Array<Omit<LicitacaoItem, 'id' | 'licitacao_id' | 'valor_total'>>;
  sourceRows: number;
};

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function powerBiHeaders() {
  return {
    Accept: 'application/json',
    ActivityId: crypto.randomUUID(),
    RequestId: crypto.randomUUID(),
    'X-PowerBI-ResourceKey': HALEX_RESOURCE_KEY,
  };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${HALEX_API_BASE}${path}`, {
    ...init,
    headers: {
      ...powerBiHeaders(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Power BI respondeu ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function getColumnLookup(schema: ConceptualSchema) {
  const entity = schema.schemas[0]?.schema.Entities.find((item) => item.Name === 'BD_CONTRATOS');
  if (!entity) throw new Error('Tabela BD_CONTRATOS nao encontrada no Power BI.');

  return new Map(entity.Properties.map((property) => [normalizeName(property.Name), property.Name]));
}

function requireColumn(lookup: Map<string, string>, normalizedName: string) {
  const column = lookup.get(normalizedName);
  if (!column) throw new Error(`Coluna ${normalizedName} nao encontrada no Power BI.`);
  return column;
}

function maskHas(mask: number | undefined, index: number, offset = 0) {
  if (mask == null) return false;
  const position = index + offset;
  if (position < 0) return false;
  return (BigInt(mask) & (BigInt(1) << BigInt(position))) !== BigInt(0);
}

function inflateDsrRows(ds: PowerBiDataSet) {
  const rows = ds.PH[0]?.DM0 || [];
  const schema = rows[0]?.S;
  if (!schema) return [];

  const dicts = ds.ValueDicts || {};
  let previous: unknown[] = [];

  return rows.map((row) => {
    const current: unknown[] = [];
    let cursor = 0;

    for (let index = 0; index < schema.length; index += 1) {
      if (maskHas(row.R, index)) {
        current[index] = previous[index];
      } else if (maskHas(row['Ø'], index, -1)) {
        current[index] = null;
      } else {
        current[index] = row.C?.[cursor] ?? null;
        cursor += 1;
      }
    }

    previous = current;

    return current.map((value, index) => {
      const dictionaryName = schema[index]?.DN;
      if (value == null || !dictionaryName) return value;
      const dictionary = dicts[dictionaryName];
      return typeof value === 'number' && dictionary ? dictionary[value] ?? value : value;
    });
  });
}

function toText(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function toNullableText(value: unknown) {
  const text = toText(value);
  return text || null;
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnly(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toIntegerText(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : text;
}

function toInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function getCarteiraByUf(uf: string | null) {
  if (!uf) return null;
  return CARTEIRA_BY_UF[uf.toUpperCase()] || null;
}

function rowIsUsable(values: unknown[]) {
  return toText(values[0]) && toText(values[2]) && toText(values[10]) && toNumber(values[17]) !== 0;
}

async function queryContractRows() {
  const [models, schema] = await Promise.all([
    fetchJson<PowerBiModelInfo>(`/public/reports/${HALEX_RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true`),
    fetchJson<ConceptualSchema>(`/public/reports/${HALEX_RESOURCE_KEY}/conceptualschema`),
  ]);

  const lookup = getColumnLookup(schema);
  const sourceColumns = [
    'cliente',
    'uf',
    'licit',
    'edital',
    'processo',
    'dtabertura',
    'dtfim',
    'coderpcliente',
    'cnpj',
    'coderpproduto',
    'nomedoproduto',
    'apresentacao2',
    'fabricante',
    'unidade',
    'nitem',
    'regionais',
    'representante',
  ].map((name) => requireColumn(lookup, name));

  const selects = [
    ...sourceColumns.map((property) => ({
      Column: { Expression: { SourceRef: { Source: 'b' } }, Property: property },
      Name: `BD_CONTRATOS.${property}`,
    })),
    {
      Aggregation: {
        Expression: { Column: { Expression: { SourceRef: { Source: 'b' } }, Property: requireColumn(lookup, 'qtdunitedital') } },
        Function: 0,
      },
      Name: 'Sum Qtd',
    },
    {
      Aggregation: {
        Expression: { Column: { Expression: { SourceRef: { Source: 'b' } }, Property: requireColumn(lookup, 'valortotalcontrator') } },
        Function: 0,
      },
      Name: 'Sum Total',
    },
    {
      Aggregation: {
        Expression: { Column: { Expression: { SourceRef: { Source: 'b' } }, Property: requireColumn(lookup, 'qtdunitsaldo') } },
        Function: 0,
      },
      Name: 'Sum Saldo Qtd',
    },
    {
      Aggregation: {
        Expression: { Column: { Expression: { SourceRef: { Source: 'b' } }, Property: requireColumn(lookup, 'valortotalsaldocontrator') } },
        Function: 0,
      },
      Name: 'Sum Saldo Valor',
    },
  ];

  const datasetId = String(models.models[0]?.id || '');
  const reportId = String(models.exploration?.id || '');

  const body = {
    version: '1.0.0',
    queries: [
      {
        Query: {
          Commands: [
            {
              SemanticQueryDataShapeCommand: {
                Query: {
                  Version: 2,
                  From: [{ Name: 'b', Entity: 'BD_CONTRATOS', Type: 0 }],
                  Select: selects,
                },
                Binding: {
                  Primary: { Groupings: [{ Projections: selects.map((_, index) => index) }] },
                  DataReduction: { DataVolume: 4, Primary: { Top: { Count: TOP_COUNT } } },
                  Version: 1,
                },
              },
            },
          ],
        },
        QueryId: '',
        ApplicationContext: {
          DatasetId: datasetId,
          Sources: [{ ReportId: reportId }],
        },
      },
    ],
    cancelQueries: [],
    modelId: Number(datasetId),
  };

  const response = await fetchJson<PowerBiQueryResponse>('/public/reports/querydata?synchronous=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const ds = response.results?.[0]?.result?.data?.dsr?.DS?.[0];
  if (!ds) {
    throw new Error('Power BI nao retornou linhas de contrato.');
  }

  return inflateDsrRows(ds)
    .filter(rowIsUsable)
    .map((values): HalexPowerBiRow => ({
      cliente: toText(values[0]),
      uf: toNullableText(values[1]),
      licit: toText(values[2]),
      edital: toNullableText(values[3]),
      processo: toNullableText(values[4]),
      dataAbertura: toDateOnly(values[5]),
      dataFim: toDateOnly(values[6]),
      codigoCliente: toIntegerText(values[7]),
      cnpj: toNullableText(values[8]),
      codigoProduto: toIntegerText(values[9]),
      produto: toText(values[10]),
      apresentacao: toNullableText(values[11]),
      fabricante: toNullableText(values[12]),
      unidade: toText(values[13]) || 'Unidade',
      numeroItem: toInteger(values[14]),
      regional: toNullableText(values[15]),
      representante: toNullableText(values[16]),
      quantidade: toNumber(values[17]),
      valorTotal: toNumber(values[18]),
      quantidadeSaldo: toNumber(values[19]),
      valorSaldo: toNumber(values[20]),
    }));
}

export function filterHalexPowerBiRows(
  rows: HalexPowerBiRow[],
  openedFrom = HALEX_IMPORT_DEFAULT_OPENED_FROM,
  openedTo = new Date().toISOString().slice(0, 10),
  representative = DEFAULT_HALEX_REPRESENTATIVE
) {
  const normalizedRepresentative = normalizeName(representative);
  if (normalizedRepresentative) {
    rows = rows.filter((row) => normalizeName(row.representante || '').includes(normalizedRepresentative));
  }

  return rows.filter(
    (row) => row.dataAbertura && row.dataAbertura >= openedFrom && row.dataAbertura <= openedTo
  );
}

export async function fetchHalexPowerBiRows(
  openedFrom = HALEX_IMPORT_DEFAULT_OPENED_FROM,
  openedTo = new Date().toISOString().slice(0, 10),
  representative = DEFAULT_HALEX_REPRESENTATIVE
) {
  return filterHalexPowerBiRows(await queryContractRows(), openedFrom, openedTo, representative);
}

function importKey(row: HalexPowerBiRow) {
  return [
    row.codigoCliente || row.cnpj || row.cliente,
    row.processo || row.edital || row.licit,
    row.edital || row.licit,
  ].join('|');
}

export function groupHalexRows(rows: HalexPowerBiRow[]): HalexImportGroup[] {
  const groups = new Map<string, HalexImportGroup>();

  for (const row of rows) {
    const carteira = getCarteiraByUf(row.uf) || row.regional;

    const key = importKey(row);
    const existing = groups.get(key);
    const itemTotal = row.valorTotal || row.valorSaldo;
    const unitValue = row.quantidade ? itemTotal / row.quantidade : 0;

    const item: Omit<LicitacaoItem, 'id' | 'licitacao_id' | 'valor_total'> = {
      numero_item: row.numeroItem || (existing?.items.length || 0) + 1,
      descricao: row.apresentacao || row.produto,
      marca: row.fabricante,
      unidade: row.unidade,
      quantidade: Math.max(1, Math.round(row.quantidade)),
      preco_minimo: null,
      valor_unitario: Number.isFinite(unitValue) ? Math.max(0, unitValue) : 0,
      codigo_produto: row.codigoProduto,
      status: 'ganho',
      observacoes: `Power BI Halex: produto ${row.produto}${row.quantidadeSaldo ? `; saldo ${row.quantidadeSaldo}` : ''}.`,
    };

    if (existing) {
      existing.items.push(item);
      existing.sourceRows += 1;
      if (!existing.licitacao.data_vencimento || (row.dataFim && row.dataFim > existing.licitacao.data_vencimento)) {
        existing.licitacao.data_vencimento = row.dataFim;
      }
      continue;
    }

    groups.set(key, {
      licitacao: {
        ano: row.dataAbertura ? Number(row.dataAbertura.slice(0, 4)) : new Date().getFullYear(),
        orgao: row.cliente,
        codigo_cliente: row.codigoCliente,
        carteira_regiao: carteira,
        cidade: null,
        estado: row.uf,
        orgao_email: null,
        orgao_telefone: null,
        orgao_contato: row.representante,
        numero_pregao: row.edital || row.licit,
        numero_processo: row.processo || row.licit,
        modalidade: null,
        data_abertura: row.dataAbertura,
        data_vencimento: row.dataFim,
        status: 'ganha',
        valor_total_ganho: 0,
        observacoes: `Importado do Power BI Halex. Licit: ${row.licit}${row.cnpj ? `; CNPJ: ${row.cnpj}` : ''}.`,
      },
      items: [item],
      sourceRows: 1,
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    items: group.items.sort((a, b) => a.numero_item - b.numero_item),
    licitacao: {
      ...group.licitacao,
      valor_total_ganho: group.items.reduce((sum, item) => sum + item.quantidade * item.valor_unitario, 0),
    },
  }));
}
