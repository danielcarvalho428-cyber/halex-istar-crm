import type { Empenho, Licitacao, LicitacaoItem } from '@/types';

export type HalexMatrixRow = Array<string | number | Date | null | undefined>;

export type HalexInvoiceItem = {
  codigoProduto: string;
  descricao: string;
  quantidadeCaixas: number;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

export type HalexInvoice = {
  key: string;
  numeroEmpenho: string;
  nf: string;
  dataEmpenho: string;
  dataFaturamento: string;
  ordemVenda: string;
  codigoCliente: string;
  nomeCliente: string;
  items: HalexInvoiceItem[];
};

export type HalexCandidateItem = {
  licitacaoItemId: string;
  codigoProduto: string;
  quantidade: number;
  valorUnitarioArquivo: number;
};

export type HalexPregaoCandidate = {
  licitacaoId: string;
  numeroPregao: string;
  orgao: string;
  dataAbertura: string | null;
  dataVencimento: string | null;
  score: number;
  dateFit: 'inside' | 'after' | 'before' | 'unknown';
  items: HalexCandidateItem[];
};

export type HalexInvoiceMatch = {
  invoice: HalexInvoice;
  candidates: HalexPregaoCandidate[];
  selectedLicitacaoId: string | null;
  confidence: 'high' | 'medium' | 'ambiguous' | 'unmatched';
  duplicateEmpenhoId: string | null;
};

export function normalizeHalexIdentifier(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

export function normalizeHalexDocument(value: string) {
  return normalizeHalexIdentifier(value.replace(/^\s*NF\s*/i, ''));
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;

  let clean = text.replace(/[^\d,.-]/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    clean = clean
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    clean = clean.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,(?=\d{3}(\D|$))/g, '');
  }

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? '').trim();
  if (!text) return '';

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20_000 && serial < 80_000) {
    return new Date(Math.round((serial - 25_569) * 86_400 * 1000)).toISOString().slice(0, 10);
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }

  return '';
}

function pricesMatch(a: number, b: number) {
  return a > 0 && b > 0 && Math.abs(a - b) <= 0.01;
}

export function parseHalexInvoiceMatrix(matrix: HalexMatrixRow[]) {
  const invoices: HalexInvoice[] = [];

  for (let index = 0; index < matrix.length; index += 1) {
    const row = matrix[index] || [];
    const isInvoiceHeader = normalizeHalexIdentifier(row[0]) === 'LANCAMENTO'
      && normalizeHalexIdentifier(row[4]) === 'NF';
    if (!isInvoiceHeader) continue;

    const metadata = matrix[index + 1] || [];
    const nf = String(metadata[4] ?? '').trim();
    const codigoCliente = String(metadata[5] ?? '').trim();
    if (!nf || !codigoCliente) continue;

    let itemHeaderIndex = -1;
    for (let cursor = index + 2; cursor < Math.min(index + 8, matrix.length); cursor += 1) {
      const possible = matrix[cursor] || [];
      if (
        normalizeHalexIdentifier(possible[0]) === 'CODPRODUTO'
        && normalizeHalexIdentifier(possible[1]) === 'DESCPRODUTO'
      ) {
        itemHeaderIndex = cursor;
        break;
      }
    }
    if (itemHeaderIndex === -1) continue;

    const items: HalexInvoiceItem[] = [];
    for (let cursor = itemHeaderIndex + 1; cursor < matrix.length; cursor += 1) {
      const item = matrix[cursor] || [];
      const first = String(item[0] ?? '').trim();
      const normalizedFirst = normalizeHalexIdentifier(first);
      if (!first || normalizedFirst.startsWith('TOTALNF') || normalizedFirst === 'LANCAMENTO') break;

      const quantidade = Math.max(0, Math.round(parseNumber(item[3])));
      const codigoProduto = String(item[0] ?? '').trim();
      if (!codigoProduto || quantidade <= 0) continue;

      items.push({
        codigoProduto,
        descricao: String(item[1] ?? '').trim(),
        quantidadeCaixas: Math.max(0, parseNumber(item[2])),
        quantidade,
        valorUnitario: Math.max(0, parseNumber(item[4])),
        valorTotal: Math.max(0, parseNumber(item[5])),
      });
    }
    if (items.length === 0) continue;

    const dataEmpenho = parseDate(metadata[0]) || parseDate(metadata[1]);
    const dataFaturamento = parseDate(metadata[1]);
    const document = normalizeHalexDocument(nf);
    invoices.push({
      key: `${normalizeHalexIdentifier(codigoCliente)}|${document}`,
      numeroEmpenho: `NF ${nf}`,
      nf,
      dataEmpenho,
      dataFaturamento,
      ordemVenda: String(metadata[3] ?? '').trim(),
      codigoCliente,
      nomeCliente: String(metadata[6] ?? '').trim(),
      items,
    });
  }

  return invoices;
}

function dateScore(invoiceDate: string, licitacao: Licitacao) {
  if (!invoiceDate || !licitacao.data_abertura) {
    return { points: 0, fit: 'unknown' as const };
  }

  const invoice = Date.parse(`${invoiceDate}T00:00:00Z`);
  const opening = Date.parse(`${licitacao.data_abertura}T00:00:00Z`);
  const expiration = licitacao.data_vencimento
    ? Date.parse(`${licitacao.data_vencimento}T00:00:00Z`)
    : null;

  if (invoice >= opening && (expiration == null || invoice <= expiration)) {
    return { points: expiration == null ? 220 : 300, fit: 'inside' as const };
  }

  const day = 86_400_000;
  if (expiration != null && invoice > expiration) {
    const daysAfter = Math.floor((invoice - expiration) / day);
    return { points: Math.max(0, 160 - Math.min(daysAfter, 160)), fit: 'after' as const };
  }

  const daysBefore = Math.floor((opening - invoice) / day);
  return { points: Math.max(0, 100 - Math.min(daysBefore, 100)), fit: 'before' as const };
}

function candidateForInvoice(
  invoice: HalexInvoice,
  licitacao: Licitacao,
  wonItems: LicitacaoItem[]
): HalexPregaoCandidate | null {
  const quantitiesByItem = new Map<string, HalexCandidateItem>();

  for (const source of invoice.items) {
    const productCode = normalizeHalexIdentifier(source.codigoProduto);
    const matched = wonItems.find(
      (item) => normalizeHalexIdentifier(item.codigo_produto) === productCode
        && pricesMatch(item.valor_unitario, source.valorUnitario)
    );
    if (!matched) return null;

    const current = quantitiesByItem.get(matched.id);
    quantitiesByItem.set(matched.id, {
      licitacaoItemId: matched.id,
      codigoProduto: source.codigoProduto,
      quantidade: (current?.quantidade || 0) + source.quantidade,
      valorUnitarioArquivo: source.valorUnitario,
    });
  }

  const date = dateScore(invoice.dataEmpenho, licitacao);
  const sameOpeningYear = invoice.dataEmpenho && licitacao.data_abertura
    && invoice.dataEmpenho.slice(0, 4) === licitacao.data_abertura.slice(0, 4);

  return {
    licitacaoId: licitacao.id,
    numeroPregao: licitacao.numero_pregao,
    orgao: licitacao.orgao,
    dataAbertura: licitacao.data_abertura,
    dataVencimento: licitacao.data_vencimento || null,
    score: invoice.items.length * 100 + date.points + (sameOpeningYear ? 50 : 0),
    dateFit: date.fit,
    items: Array.from(quantitiesByItem.values()),
  };
}

export function matchHalexInvoices(
  invoices: HalexInvoice[],
  licitacoes: Licitacao[],
  items: LicitacaoItem[],
  empenhos: Empenho[]
) {
  const licitacaoById = new Map(licitacoes.map((licitacao) => [licitacao.id, licitacao]));
  const duplicateByClientAndDocument = new Map<string, string>();
  const seenInvoiceKeys = new Set<string>();
  const wonItemsByLicitacao = new Map<string, LicitacaoItem[]>();
  for (const item of items) {
    if (item.status !== 'ganho') continue;
    wonItemsByLicitacao.set(
      item.licitacao_id,
      [...(wonItemsByLicitacao.get(item.licitacao_id) || []), item]
    );
  }
  for (const licitacaoItems of wonItemsByLicitacao.values()) {
    licitacaoItems.sort((a, b) => a.numero_item - b.numero_item);
  }

  for (const empenho of empenhos) {
    const licitacao = licitacaoById.get(empenho.licitacao_id);
    if (!licitacao?.codigo_cliente) continue;
    duplicateByClientAndDocument.set(
      `${normalizeHalexIdentifier(licitacao.codigo_cliente)}|${normalizeHalexDocument(empenho.numero_empenho)}`,
      empenho.id
    );
  }

  return invoices.map((invoice): HalexInvoiceMatch => {
    const sameClient = licitacoes.filter(
      (licitacao) => normalizeHalexIdentifier(licitacao.codigo_cliente)
        === normalizeHalexIdentifier(invoice.codigoCliente)
    );
    const candidates = sameClient
      .map((licitacao) => candidateForInvoice(
        invoice,
        licitacao,
        wonItemsByLicitacao.get(licitacao.id) || []
      ))
      .filter((candidate): candidate is HalexPregaoCandidate => candidate !== null)
      .sort((a, b) => b.score - a.score || b.numeroPregao.localeCompare(a.numeroPregao));
    const topScore = candidates[0]?.score;
    const tied = topScore != null && candidates.filter((candidate) => candidate.score === topScore).length > 1;
    const selected = candidates.length > 0 && !tied ? candidates[0].licitacaoId : null;
    const confidence = candidates.length === 0
      ? 'unmatched'
      : tied
        ? 'ambiguous'
        : candidates[0].dateFit === 'inside'
          ? 'high'
          : 'medium';

    const duplicateEmpenhoId = duplicateByClientAndDocument.get(invoice.key)
      || (seenInvoiceKeys.has(invoice.key) ? 'duplicate-in-file' : null);
    seenInvoiceKeys.add(invoice.key);

    return {
      invoice,
      candidates,
      selectedLicitacaoId: selected,
      confidence,
      duplicateEmpenhoId,
    };
  });
}

export type BulkEmpenhoImportEntry = {
  key: string;
  licitacaoId: string;
  codigoCliente: string;
  numeroEmpenho: string;
  dataEmpenho: string;
  dataFaturamento?: string;
  ordemVenda?: string;
  orgao?: string;
  items: HalexCandidateItem[];
};

export type BulkEmpenhoImportResult = {
  imported: string[];
  duplicates: string[];
  failed: Array<{ key: string; message: string }>;
};
