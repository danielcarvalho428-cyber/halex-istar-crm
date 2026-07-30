import {
  quotationCurrencyValue,
  quotationDisplayUnitPrice,
  quotationLineDisplayTotal,
  quotationLineUnits,
  type QuotationQuantityMode,
} from "./quotation-quantity.ts";

export type QuotationExportItem = {
  code: string;
  description: string;
  presentation?: string;
  brand?: string;
  packSize: number;
  quantityMode?: QuotationQuantityMode;
  /** Quantity in whole boxes. */
  quantity: number;
  /** Quantity in units, used when quantityMode is "units". */
  unitQuantity?: number | null;
  /** Price per unit, as stored. Displayed per box in "boxes" mode. */
  unitPrice: number;
};

export type QuotationExportInput = {
  brand: string;
  quoteNumber: string;
  client: { name: string; cnpj?: string | null; city?: string | null; state?: string | null };
  /** YYYY-MM-DD */
  issuedAt: string;
  /** YYYY-MM-DD */
  validUntil?: string;
  validDays?: number;
  payment?: string;
  delivery?: string;
  freight?: string;
  notes?: string;
  minimumBilling?: number | null;
  seller?: string;
  representativeRole?: string;
  representativePhone?: string;
  representativeEmail?: string;
  salesPriceTable?: string;
  salesPriceRegion?: string;
  hidePrices?: boolean;
  items: QuotationExportItem[];
};

// A row-role model instead of raw cells: the builder decides *what* the sheet
// says (and stays testable without a spreadsheet library), the renderer decides
// how each role looks.
export type QuotationSheetRow =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "spacer" }
  | { kind: "section"; text: string }
  | { kind: "field"; label: string; value: string }
  | { kind: "tableHeader"; cells: string[] }
  | { kind: "item"; cells: (string | number)[] }
  | { kind: "total"; label: string; value: number }
  | { kind: "note"; text: string };

export type QuotationSheet = {
  brand: string;
  sheetName: string;
  fileName: string;
  /** Column count of the item table; every merged row spans exactly this much. */
  columnCount: number;
  columnWidths: number[];
  /** Zero-based index of the money columns, for currency formatting. */
  currencyColumns: number[];
  withPrices: boolean;
  rows: QuotationSheetRow[];
  total: number;
  itemCount: number;
};

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Dates are stored as plain YYYY-MM-DD; parse at midday so the label never
// shifts a day in UTC-3.
function dateLabel(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

const PRICE_HEADERS = [
  "Item",
  "Código",
  "Produto",
  "Apresentação",
  "Marca",
  "Un./cx",
  "Qtd. (cx)",
  "Qtd. (un)",
  "Preço unitário (R$)",
  "Total (R$)",
];
const PRICE_WIDTHS = [6, 12, 44, 32, 14, 8, 10, 11, 19, 16];
// Without prices the document is a technical item list, so quantities and money
// columns are dropped entirely — same as the printed PDF.
const PLAIN_HEADERS = ["Item", "Código", "Produto", "Apresentação", "Marca", "Un./cx"];
const PLAIN_WIDTHS = [6, 12, 50, 38, 16, 8];

export function buildQuotationSheet(input: QuotationExportInput): QuotationSheet {
  const withPrices = !input.hidePrices;
  const headers = withPrices ? PRICE_HEADERS : PLAIN_HEADERS;
  const rows: QuotationSheetRow[] = [];

  const cityState = [input.client.city, input.client.state].filter(Boolean).join("/");

  rows.push({ kind: "title", text: input.brand });
  rows.push({
    kind: "subtitle",
    text: `Proposta comercial ${input.quoteNumber} · ${input.client.name}`,
  });
  rows.push({ kind: "spacer" });

  rows.push({ kind: "section", text: "Dados da proposta" });
  rows.push({ kind: "field", label: "Cliente", value: input.client.name });
  if (input.client.cnpj) rows.push({ kind: "field", label: "CNPJ", value: input.client.cnpj });
  if (cityState) rows.push({ kind: "field", label: "Cidade", value: cityState });
  rows.push({ kind: "field", label: "Cotação nº", value: input.quoteNumber });
  rows.push({ kind: "field", label: "Data da proposta", value: dateLabel(input.issuedAt) });
  if (input.validUntil) {
    rows.push({
      kind: "field",
      label: "Validade",
      value: input.validDays
        ? `Até ${dateLabel(input.validUntil)} · ${input.validDays} dias`
        : `Até ${dateLabel(input.validUntil)}`,
    });
  }
  if (input.salesPriceTable) {
    rows.push({
      kind: "field",
      label: "Tabela de preços",
      value: input.salesPriceRegion
        ? `${input.salesPriceTable} · ${input.salesPriceRegion}`
        : input.salesPriceTable,
    });
  }
  rows.push({ kind: "spacer" });

  rows.push({ kind: "tableHeader", cells: headers });

  let total = 0;
  input.items.forEach((item, index) => {
    const packSize = Math.max(1, Math.trunc(Number(item.packSize) || 1));
    const cells: (string | number)[] = [
      index + 1,
      item.code,
      item.description,
      item.presentation || "",
      item.brand || input.brand,
      packSize,
    ];
    if (withPrices) {
      const units = quotationLineUnits(item.quantityMode, item.quantity, item.unitQuantity ?? undefined, packSize);
      const lineTotal = quotationLineDisplayTotal(
        item.quantityMode,
        item.quantity,
        item.unitQuantity ?? undefined,
        packSize,
        item.unitPrice,
      );
      total += lineTotal;
      cells.push(
        Math.max(0, Math.trunc(Number(item.quantity) || 0)),
        units,
        quotationCurrencyValue(quotationDisplayUnitPrice(item.quantityMode, item.unitPrice, packSize)),
        lineTotal,
      );
    }
    rows.push({ kind: "item", cells });
  });

  total = quotationCurrencyValue(total);

  if (withPrices) {
    rows.push({ kind: "total", label: "Valor total da proposta", value: total });
  }

  rows.push({ kind: "spacer" });
  rows.push({ kind: "section", text: "Condições comerciais" });
  if (input.payment) rows.push({ kind: "field", label: "Pagamento", value: input.payment });
  if (input.delivery) rows.push({ kind: "field", label: "Entrega", value: input.delivery });
  if (input.freight) rows.push({ kind: "field", label: "Frete", value: input.freight });
  if (withPrices && input.minimumBilling && input.minimumBilling > 0) {
    rows.push({
      kind: "field",
      label: "Faturamento mínimo",
      value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        input.minimumBilling,
      ),
    });
  }
  if (input.notes) rows.push({ kind: "field", label: "Observações", value: input.notes });

  rows.push({ kind: "spacer" });
  rows.push({ kind: "section", text: "Representante comercial" });
  if (input.seller) {
    rows.push({
      kind: "field",
      label: "Nome",
      value: input.representativeRole ? `${input.seller} · ${input.representativeRole}` : input.seller,
    });
  }
  rows.push({
    kind: "field",
    label: "Telefone",
    value: input.representativePhone || "Não informado",
  });
  rows.push({ kind: "field", label: "E-mail", value: input.representativeEmail || "Não informado" });

  rows.push({ kind: "spacer" });
  rows.push({
    kind: "note",
    text: withPrices
      ? "Preços em reais, sujeitos a alteração sem aviso prévio. Documento comercial gerado pelo sistema."
      : "Relação de itens sem preços. Documento comercial gerado pelo sistema.",
  });

  const clientPart = slug(input.client.name).slice(0, 40);
  return {
    brand: input.brand,
    sheetName: `Cotação ${input.quoteNumber}`.slice(0, 31),
    fileName: `cotacao-${slug(input.quoteNumber)}${clientPart ? `-${clientPart}` : ""}${withPrices ? "" : "-sem-precos"}.xlsx`,
    columnCount: headers.length,
    columnWidths: withPrices ? PRICE_WIDTHS : PLAIN_WIDTHS,
    currencyColumns: withPrices ? [8, 9] : [],
    withPrices,
    rows,
    total,
    itemCount: input.items.length,
  };
}
