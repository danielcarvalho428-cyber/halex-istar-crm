import { CARTEIRA_OPTIONS } from "./crm-preview.ts";
import { formatCnpj } from "./client-duplicates.ts";
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
