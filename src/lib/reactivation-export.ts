import { CARTEIRA_OPTIONS, type CrmClient } from "./crm-preview.ts";
import { formatCnpj, normalizeCnpj } from "./client-duplicates.ts";
import { isCnpjBaixado } from "./client-contact-sources.ts";
import { SALES_SEGMENTS, type ClientSalesSummary } from "./sales-history.ts";

export type ReactivationExportRow = {
  codigo: string;
  cliente: string;
  cnpj: string;
  cidade: string;
  uf: string;
  contato: string;
  telefone: string;
  email: string;
  situacao: string;
  ultimaCompra: string;
  diasSemComprar: number | "";
  compras: number;
  totalPeriodo: number;
  total12m: number;
  cicloMedio: number | "";
  foraDoCiclo: string;
  cnpjBaixado: string;
  /** Decisão já registrada, para a planilha voltar com o histórico. */
  reconquistar: string;
  observacoes: string;
};

export type ReactivationSheet = {
  /** "4104", "4413", "4648" or "Sem carteira". */
  carteira: string;
  rows: ReactivationExportRow[];
  total: number;
};

export const SEM_CARTEIRA = "Sem carteira";

/** The answers the vendedor picks on the Reconquistar? column. */
export const RECONQUEST_CHOICES = ["SIM", "NÃO", "TALVEZ"] as const;

function segmentLabel(summary: ClientSalesSummary) {
  return SALES_SEGMENTS.find((item) => item.value === summary.segment)?.label
    || "Sem compra no período";
}

function toRow(summary: ClientSalesSummary): ReactivationExportRow {
  const { client } = summary;
  return {
    codigo: client.code || "",
    cliente: client.name || "",
    cnpj: formatCnpj(client.cnpj) || "",
    cidade: client.city || "",
    uf: client.state || "",
    contato: client.contact || "",
    telefone: client.phone || "",
    email: client.email || "",
    situacao: segmentLabel(summary),
    ultimaCompra: summary.lastPurchase || "",
    // Infinity means "never bought in the report": the cell stays empty.
    diasSemComprar: Number.isFinite(summary.daysSinceLast) ? summary.daysSinceLast : "",
    compras: summary.orders,
    totalPeriodo: Number(summary.total.toFixed(2)),
    total12m: Number(summary.total12m.toFixed(2)),
    cicloMedio: summary.averageIntervalDays || "",
    foraDoCiclo: summary.overdue ? "SIM" : "",
    cnpjBaixado: isCnpjBaixado(client) ? "SIM" : "",
    reconquistar: client.reactivationDecision || "",
    observacoes: client.reactivationNote || "",
  };
}

/**
 * One sheet per carteira, in the order the equipe uses them, with whoever has
 * no carteira on record at the end. Inside each sheet the biggest client comes
 * first: that is the order the reconquista should be worked in.
 */
export function buildReactivationSheets(summaries: ClientSalesSummary[]): ReactivationSheet[] {
  const byCarteira = new Map<string, ClientSalesSummary[]>();
  for (const summary of summaries) {
    const carteira = String(summary.client.carteira || "").trim() || SEM_CARTEIRA;
    byCarteira.set(carteira, [...(byCarteira.get(carteira) || []), summary]);
  }

  const known = CARTEIRA_OPTIONS.filter((carteira) => byCarteira.has(carteira));
  const others = [...byCarteira.keys()]
    .filter((carteira) => !known.includes(carteira as (typeof CARTEIRA_OPTIONS)[number]) && carteira !== SEM_CARTEIRA)
    .sort();
  const ordered = [...known, ...others, ...(byCarteira.has(SEM_CARTEIRA) ? [SEM_CARTEIRA] : [])];

  return ordered.map((carteira) => {
    const group = (byCarteira.get(carteira) || [])
      .slice()
      .sort((a, b) => b.total - a.total || a.client.name.localeCompare(b.client.name));
    return {
      carteira,
      rows: group.map(toRow),
      total: Number(group.reduce((sum, item) => sum + item.total, 0).toFixed(2)),
    };
  });
}

export type ReactivationMark = {
  code: string;
  cnpj: string;
  name: string;
  decision: string;
  note: string;
};

export type MatchedMark = {
  clientId: string;
  clientName: string;
  decision: string;
  note: string;
};

function normalizeDecision(value: unknown) {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
  if (!text) return "";
  if (text.startsWith("S")) return "SIM";
  if (text.startsWith("N")) return "NÃO";
  if (text.startsWith("T")) return "TALVEZ";
  return "";
}

function headerKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Reads back the planilha the equipe marked. Only the columns that matter are
 * looked up by name, so reordering or hiding columns in Excel is harmless.
 */
export function parseReactivationMarks(matrix: Array<Array<unknown>>): ReactivationMark[] {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => headerKey(cell) === "RECONQUISTAR"));
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex].map(headerKey);
  const columnOf = (name: string) => headers.findIndex((header) => header === name);
  const codeAt = columnOf("CODIGO");
  const nameAt = columnOf("CLIENTE");
  const cnpjAt = columnOf("CNPJ");
  const decisionAt = columnOf("RECONQUISTAR");
  const noteAt = columnOf("OBSERVACOES");

  const marks: ReactivationMark[] = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    const decision = decisionAt >= 0 ? normalizeDecision(row[decisionAt]) : "";
    const note = noteAt >= 0 ? String(row[noteAt] ?? "").trim() : "";
    if (!decision && !note) continue;

    marks.push({
      code: codeAt >= 0 ? String(row[codeAt] ?? "").trim() : "",
      cnpj: cnpjAt >= 0 ? String(row[cnpjAt] ?? "").replace(/\D/g, "") : "",
      name: nameAt >= 0 ? String(row[nameAt] ?? "").trim() : "",
      decision,
      note,
    });
  }
  return marks;
}

/** Ties each mark to the cadastro it belongs to, by código and then by CNPJ. */
export function matchReactivationMarks(
  clients: CrmClient[],
  marks: ReactivationMark[],
): { matched: MatchedMark[]; unmatched: ReactivationMark[] } {
  const byCode = new Map<string, CrmClient>();
  const byCnpj = new Map<string, CrmClient>();
  for (const client of clients) {
    const code = String(client.code || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const cnpj = normalizeCnpj(client.cnpj);
    if (code && !byCode.has(code)) byCode.set(code, client);
    if (cnpj && !byCnpj.has(cnpj)) byCnpj.set(cnpj, client);
  }

  const matched: MatchedMark[] = [];
  const unmatched: ReactivationMark[] = [];
  const seen = new Set<string>();

  for (const mark of marks) {
    const code = mark.code.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const client = byCode.get(code) || (mark.cnpj ? byCnpj.get(mark.cnpj) : undefined);
    if (!client || seen.has(client.id)) {
      if (!client) unmatched.push(mark);
      continue;
    }
    seen.add(client.id);
    matched.push({
      clientId: client.id,
      clientName: client.name,
      decision: mark.decision,
      note: mark.note,
    });
  }

  return { matched, unmatched };
}
