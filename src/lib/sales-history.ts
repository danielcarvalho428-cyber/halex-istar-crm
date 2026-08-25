import type { CrmClient } from "./crm-preview";
import { normalizeCnpj } from "./client-duplicates.ts";

export type SalesRow = {
  clientCode: string;
  clientName: string;
  cnpj: string;
  /** YYYY-MM-DD */
  date: string;
  document: string;
  value: number;
};

export type SalesColumnMap = {
  clientCode: number;
  clientName: number;
  cnpj: number;
  date: number;
  document: number;
  value: number;
};

export type SalesMatrixRow = Array<string | number | Date | null | undefined>;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Header aliases seen across the relatórios the equipe downloads. The first
 * match wins, so the more specific alias comes first.
 */
const COLUMN_ALIASES: Record<keyof SalesColumnMap, string[]> = {
  clientCode: ["CODIGOCLIENTE", "CODCLIENTE", "CLIENTECODIGO", "CODIGODOCLIENTE", "CODCLI", "CODIGO"],
  clientName: ["NOMECLIENTE", "RAZAOSOCIAL", "CLIENTE", "NOMEDOCLIENTE", "NOME"],
  cnpj: ["CNPJ", "CNPJCLIENTE", "CPFCNPJ", "DOCUMENTO"],
  date: [
    "DATAFATURAMENTO", "DATADEFATURAMENTO", "DATAEMISSAO", "DATADEEMISSAO",
    "DATANF", "DATAVENDA", "DATA", "EMISSAO", "FATURAMENTO",
  ],
  document: ["NOTAFISCAL", "NUMERONF", "NF", "NFE", "DOCUMENTO", "NUMERODOCUMENTO", "PEDIDO"],
  value: [
    "VALORTOTAL", "VALORFATURADO", "VALORTOTALFATURADO", "TOTAL", "VALOR",
    "VALORLIQUIDO", "VALORNF", "FATURAMENTOTOTAL",
  ],
};

/** Finds which column holds each field, so any relatório layout works. */
export function detectColumns(headers: SalesMatrixRow): SalesColumnMap {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();

  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const exact = normalized.findIndex((header, index) => header === alias && !used.has(index));
      if (exact >= 0) {
        used.add(exact);
        return exact;
      }
    }
    for (const alias of aliases) {
      const partial = normalized.findIndex(
        (header, index) => header.includes(alias) && !used.has(index),
      );
      if (partial >= 0) {
        used.add(partial);
        return partial;
      }
    }
    return -1;
  };

  // Codes and documents are matched first: their aliases are the narrowest,
  // and "DOCUMENTO" would otherwise be eaten by the CNPJ column.
  const clientCode = find(COLUMN_ALIASES.clientCode);
  const cnpj = find(COLUMN_ALIASES.cnpj);
  const date = find(COLUMN_ALIASES.date);
  const value = find(COLUMN_ALIASES.value);
  const document = find(COLUMN_ALIASES.document);
  const clientName = find(COLUMN_ALIASES.clientName);

  return { clientCode, clientName, cnpj, date, document, value };
}

export function parseSalesNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!text) return 0;
  // "1.234,56" is pt-BR; "1234.56" is already machine readable.
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSalesDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  // Excel serial dates arrive as plain numbers.
  if (typeof value === "number" && value > 20_000 && value < 60_000) {
    return new Date(Math.round((value - 25_569) * 86_400 * 1000)).toISOString().slice(0, 10);
  }

  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return "";
}

/**
 * O relatório detalhado da Halex não é uma tabela plana: cada NF tem uma linha
 * de cabeçalho, uma de dados e, abaixo, os itens — e é no item que está o
 * valor ("Total Item (R$)"). Ler só o cabeçalho traz a nota sem dinheiro
 * nenhum, que foi exatamente o que acontecia.
 */
export function parseHalexDetailedMatrix(matrix: SalesMatrixRow[]): SalesRow[] {
  const rows: SalesRow[] = [];

  for (let index = 0; index < matrix.length; index += 1) {
    const header = matrix[index] || [];
    const isInvoiceHeader = normalizeHeader(header[0]) === "LANCAMENTO"
      && normalizeHeader(header[4]) === "NF";
    if (!isInvoiceHeader) continue;

    const metadata = matrix[index + 1] || [];
    // O que diz se o cliente comprou é a data do pedido (lançamento), não a da
    // nota: um pedido faturado em parcelas gera notas meses depois e faria o
    // cliente parecer ativo em um ano em que não pediu nada.
    const date = parseSalesDate(metadata[0]) || parseSalesDate(metadata[1]);
    const clientCode = String(metadata[5] ?? "").trim();
    if (!date || !clientCode) continue;

    let itemHeader = -1;
    for (let cursor = index + 2; cursor < Math.min(index + 8, matrix.length); cursor += 1) {
      if (normalizeHeader((matrix[cursor] || [])[0]) === "CODPRODUTO") {
        itemHeader = cursor;
        break;
      }
    }
    if (itemHeader < 0) continue;

    let items = 0;
    let cursor = itemHeader + 1;
    for (; cursor < matrix.length; cursor += 1) {
      const item = matrix[cursor] || [];
      const first = normalizeHeader(item[0]);
      if (first.startsWith("TOTALNF") || first === "LANCAMENTO") break;
      if (!String(item[0] ?? "").trim()) continue;
      items += parseSalesNumber(item[5]);
    }

    // O rodapé "TOTAL NF (R$)" é o valor oficial da nota. A coluna de item
    // vem com fator de mil em parte do relatório (preço 5,10 gravado como
    // 5100), então somar item por item inflaria o faturamento.
    const footer = String((matrix[cursor] || [])[0] ?? "");
    const declared = normalizeHeader(footer).startsWith("TOTALNF")
      ? parseSalesNumber(footer.replace(/^[^\d-]*/, ""))
      : 0;
    const total = declared || items;

    const name = String(metadata[6] ?? "").trim();
    rows.push({
      clientCode,
      // "502957 - HOSP. EVANGELICO" traz o código colado no nome.
      clientName: name.replace(/^\s*\d+\s*-\s*/, ""),
      cnpj: "",
      date,
      document: String(metadata[4] ?? "").trim().replace(/^0+(?=\d)/, ""),
      value: Number(total.toFixed(2)),
    });
    index = cursor - 1;
  }

  return rows;
}

/** Reads the whole sheet, skipping anything that is not a real sale. */
export function parseSalesMatrix(matrix: SalesMatrixRow[], mapping?: SalesColumnMap) {
  // O relatório detalhado tem prioridade: nele o cabeçalho plano existe, mas
  // não carrega valor nenhum.
  if (!mapping) {
    const detailed = parseHalexDetailedMatrix(matrix);
    if (detailed.length > 0) return { rows: detailed, mapping: null, ignored: 0, layout: "detalhado" as const };
  }

  const headerIndex = matrix.findIndex((row) => {
    const columns = detectColumns(row);
    return columns.date >= 0 && (columns.clientCode >= 0 || columns.cnpj >= 0 || columns.clientName >= 0);
  });
  if (headerIndex < 0 && !mapping) {
    return { rows: [], mapping: null, ignored: matrix.length, layout: "desconhecido" as const };
  }

  const columns = mapping || detectColumns(matrix[headerIndex]);
  const rows: SalesRow[] = [];
  let ignored = 0;

  for (const row of matrix.slice(headerIndex + 1)) {
    const date = parseSalesDate(columns.date >= 0 ? row[columns.date] : "");
    const clientCode = columns.clientCode >= 0 ? String(row[columns.clientCode] ?? "").trim() : "";
    const cnpj = columns.cnpj >= 0 ? normalizeCnpj(String(row[columns.cnpj] ?? "")) : "";
    const clientName = columns.clientName >= 0 ? String(row[columns.clientName] ?? "").trim() : "";

    if (!date || (!clientCode && !cnpj && !clientName)) {
      ignored += 1;
      continue;
    }
    rows.push({
      clientCode,
      clientName,
      cnpj: cnpj.length === 14 ? cnpj : "",
      date,
      document: columns.document >= 0 ? String(row[columns.document] ?? "").trim() : "",
      value: columns.value >= 0 ? parseSalesNumber(row[columns.value]) : 0,
    });
  }

  return { rows, mapping: columns, ignored, layout: "tabela" as const };
}

export const SALES_SEGMENTS = [
  { value: "ativo", label: "Comprando (até 3 meses)", maxDays: 90 },
  { value: "atencao", label: "3 a 6 meses sem comprar", maxDays: 180 },
  { value: "frio", label: "6 a 12 meses sem comprar", maxDays: 365 },
  { value: "perdido", label: "1 a 2 anos sem comprar", maxDays: 730 },
  { value: "dormente", label: "Mais de 2 anos sem comprar", maxDays: Infinity },
] as const;

export type SalesSegment = (typeof SALES_SEGMENTS)[number]["value"] | "sem_compra";

export type ClientSalesSummary = {
  client: CrmClient;
  firstPurchase: string;
  lastPurchase: string;
  daysSinceLast: number;
  orders: number;
  total: number;
  total12m: number;
  /** Average days between purchases, 0 when there is only one. */
  averageIntervalDays: number;
  /** Buying less often than the client's own rhythm. */
  overdue: boolean;
  segment: SalesSegment;
};

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function segmentFor(daysSinceLast: number): SalesSegment {
  return SALES_SEGMENTS.find((item) => daysSinceLast <= item.maxDays)?.value || "dormente";
}

function clientKeys(client: CrmClient) {
  return {
    code: String(client.code || "").replace(/\D/g, "").replace(/^0+(?=\d)/, ""),
    cnpj: normalizeCnpj(client.cnpj),
  };
}

/**
 * Turns the relatório into one line per client: when they last bought, how
 * often they used to buy, and how long they have been away. Órgão público is
 * dropped by default — reconquista there depends on a licitação, not a call.
 */
export function summarizeClientSales(
  clients: CrmClient[],
  rows: SalesRow[],
  options: { today: string; includeOrgaoPublico?: boolean },
): ClientSalesSummary[] {
  const { today, includeOrgaoPublico = false } = options;

  const byCode = new Map<string, CrmClient>();
  const byCnpj = new Map<string, CrmClient>();
  for (const client of clients) {
    const keys = clientKeys(client);
    if (keys.code && !byCode.has(keys.code)) byCode.set(keys.code, client);
    if (keys.cnpj && !byCnpj.has(keys.cnpj)) byCnpj.set(keys.cnpj, client);
  }

  const salesByClient = new Map<string, SalesRow[]>();
  for (const row of rows) {
    const code = row.clientCode.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const client = byCode.get(code) || (row.cnpj ? byCnpj.get(row.cnpj) : undefined);
    if (!client) continue;
    salesByClient.set(client.id, [...(salesByClient.get(client.id) || []), row]);
  }

  const yearAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return clients
    .filter((client) => includeOrgaoPublico || client.clientType !== "orgao_publico")
    .map((client): ClientSalesSummary => {
      const sales = (salesByClient.get(client.id) || []).sort((a, b) => a.date.localeCompare(b.date));
      if (sales.length === 0) {
        return {
          client,
          firstPurchase: "",
          lastPurchase: "",
          daysSinceLast: Infinity,
          orders: 0,
          total: 0,
          total12m: 0,
          averageIntervalDays: 0,
          overdue: false,
          segment: "sem_compra",
        };
      }

      // Several linhas of the same nota are one purchase, not many.
      const dates = [...new Set(sales.map((sale) => sale.date))];
      const firstPurchase = dates[0];
      const lastPurchase = dates[dates.length - 1];
      const daysSinceLast = daysBetween(lastPurchase, today);
      const averageIntervalDays = dates.length > 1
        ? Math.round(daysBetween(firstPurchase, lastPurchase) / (dates.length - 1))
        : 0;

      return {
        client,
        firstPurchase,
        lastPurchase,
        daysSinceLast,
        orders: dates.length,
        total: sales.reduce((sum, sale) => sum + sale.value, 0),
        total12m: sales.filter((sale) => sale.date >= yearAgo).reduce((sum, sale) => sum + sale.value, 0),
        averageIntervalDays,
        overdue: averageIntervalDays > 0 && daysSinceLast > averageIntervalDays * 1.5,
        segment: segmentFor(daysSinceLast),
      };
    })
    .sort((a, b) => b.total - a.total || a.client.name.localeCompare(b.client.name));
}

export function countBySegment(summaries: ClientSalesSummary[]) {
  const counts = new Map<SalesSegment, number>();
  for (const summary of summaries) {
    counts.set(summary.segment, (counts.get(summary.segment) || 0) + 1);
  }
  return counts;
}

export type UnknownSalesClient = {
  /** Código as it appears in the relatório, trimmed of leading zeros. */
  code: string;
  cnpj: string;
  name: string;
  orders: number;
  total: number;
  firstPurchase: string;
  lastPurchase: string;
};

/**
 * Clients present in the relatório but missing from the cadastro. They are
 * often real business nobody is working — worth showing instead of dropping.
 */
export function unknownSalesClients(
  clients: CrmClient[],
  rows: SalesRow[],
): UnknownSalesClient[] {
  const codes = new Set<string>();
  const cnpjs = new Set<string>();
  for (const client of clients) {
    const keys = clientKeys(client);
    if (keys.code) codes.add(keys.code);
    if (keys.cnpj) cnpjs.add(keys.cnpj);
  }

  const found = new Map<string, UnknownSalesClient>();
  for (const row of rows) {
    const code = row.clientCode.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if ((code && codes.has(code)) || (row.cnpj && cnpjs.has(row.cnpj))) continue;

    const key = code || row.cnpj || row.clientName.toUpperCase();
    if (!key) continue;
    const current = found.get(key);
    found.set(key, {
      code,
      cnpj: row.cnpj || current?.cnpj || "",
      // The name can be blank on some linhas of the same client.
      name: current?.name || row.clientName,
      orders: (current?.orders || 0) + 1,
      total: (current?.total || 0) + row.value,
      firstPurchase: current && current.firstPurchase < row.date ? current.firstPurchase : row.date,
      lastPurchase: current && current.lastPurchase > row.date ? current.lastPurchase : row.date,
    });
  }

  return [...found.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
