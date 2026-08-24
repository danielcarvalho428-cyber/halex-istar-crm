import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from "@/types";
import type { HalexInvoice } from "./halex-bulk-empenho";
import {
  normalizeBusinessIdentifier,
  reconcileOrder,
  type FulfillmentResult,
  type InvoiceRecord,
  type OriginalOrder,
} from "./order-fulfillment.ts";

export type ClientOrder = OriginalOrder & {
  empenhoId: string;
  licitacaoId: string;
  clientCode: string;
};

export type InvoiceReconciliation = {
  order: ClientOrder | null;
  result: FulfillmentResult | null;
  /** Every NF of the loaded report that settles the same pedido. */
  invoiceNumbers: string[];
};

function cleanNumber(value: string) {
  return String(value ?? "").trim().replace(/^0+(?=\d)/, "");
}

/**
 * The pedido do cliente lives in the CRM as an empenho: its items point at the
 * licitação items, which carry the product code the Halex report also uses.
 */
export function buildClientOrders(
  licitacoes: Licitacao[],
  itens: LicitacaoItem[],
  empenhos: Empenho[],
  empenhoItens: EmpenhoItem[],
): ClientOrder[] {
  const licitacaoById = new Map(licitacoes.map((licitacao) => [licitacao.id, licitacao]));
  const itemById = new Map(itens.map((item) => [item.id, item]));
  const itemsByEmpenho = new Map<string, EmpenhoItem[]>();
  for (const item of empenhoItens) {
    itemsByEmpenho.set(item.empenho_id, [...(itemsByEmpenho.get(item.empenho_id) || []), item]);
  }

  return empenhos.map((empenho): ClientOrder => {
    const licitacao = licitacaoById.get(empenho.licitacao_id);
    const orderItems = (itemsByEmpenho.get(empenho.id) || empenho.itens || []).map((item) => {
      const source = itemById.get(item.licitacao_item_id);
      return {
        productCode: source?.codigo_produto || "",
        description: source?.descricao || "",
        orderedQuantity: item.quantidade_empenhada,
      };
    });

    return {
      empenhoId: empenho.id,
      licitacaoId: empenho.licitacao_id,
      clientCode: licitacao?.codigo_cliente || "",
      orderNumber: cleanNumber(empenho.numero_empenho),
      sapOrderNumber: "",
      customerOrderNumber: empenho.numero_empenho,
      clientName: empenho.orgao || licitacao?.orgao || "",
      clientEmail: licitacao?.orgao_email || "",
      createdAt: empenho.data_empenho,
      items: orderItems,
    };
  });
}

/** Identifiers the Halex report may carry for the same pedido. */
function invoiceOrderKeys(invoice: HalexInvoice) {
  return [
    invoice.pedidoCliente || "",
    invoice.numeroEmpenho.replace(/^(OV|NF)\s*/i, ""),
    invoice.ordemVenda,
  ]
    .map(normalizeBusinessIdentifier)
    .filter(Boolean);
}

export function findOrderForInvoice(orders: ClientOrder[], invoice: HalexInvoice) {
  const keys = new Set(invoiceOrderKeys(invoice));
  if (keys.size === 0) return null;
  const clientCode = normalizeBusinessIdentifier(invoice.codigoCliente);

  const matches = orders.filter((order) => {
    if (!keys.has(normalizeBusinessIdentifier(order.customerOrderNumber))) return false;
    // The pedido number alone can repeat across clients; keep the client check
    // whenever the report tells us which client it belongs to.
    return !clientCode || !order.clientCode
      || normalizeBusinessIdentifier(order.clientCode) === clientCode;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function toInvoiceRecord(invoice: HalexInvoice): InvoiceRecord {
  return {
    invoiceNumber: cleanNumber(invoice.nf),
    sapOrderNumber: invoice.ordemVenda,
    customerOrderNumber: invoice.pedidoCliente
      || invoice.numeroEmpenho.replace(/^(OV|NF)\s*/i, ""),
    clientCode: invoice.codigoCliente,
    clientName: invoice.nomeCliente,
    invoicedAt: invoice.dataFaturamento,
    items: invoice.items.map((item) => ({
      productCode: item.codigoProduto,
      description: item.descricao,
      invoicedQuantity: item.quantidade,
    })),
  };
}

/**
 * Reconciles one NF against the pedido do cliente, counting every NF of the
 * loaded report that settles the same pedido — partial billing is spread over
 * several notas fiscais.
 */
export function reconcileInvoice(
  invoice: HalexInvoice,
  allInvoices: HalexInvoice[],
  orders: ClientOrder[],
): InvoiceReconciliation {
  const order = findOrderForInvoice(orders, invoice);
  if (!order) return { order: null, result: null, invoiceNumbers: [cleanNumber(invoice.nf)] };

  const related = allInvoices.filter(
    (candidate) => candidate === invoice
      || findOrderForInvoice(orders, candidate)?.empenhoId === order.empenhoId,
  );
  const result = reconcileOrder(order, related.map(toInvoiceRecord));
  return {
    order,
    result,
    invoiceNumbers: [...new Set(result.invoices.map((item) => item.invoiceNumber).filter(Boolean))],
  };
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function quantity(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export const BILLING_EMAIL_TEMPLATES = [
  { value: "integral", label: "Faturado integralmente" },
  { value: "parcial", label: "Faturado parcialmente" },
  { value: "pendente", label: "Ainda não faturado" },
] as const;

export type BillingEmailTemplate = (typeof BILLING_EMAIL_TEMPLATES)[number]["value"];

/** The template the conferência points to; the user can always pick another. */
export function suggestBillingTemplate(reconciliation: InvoiceReconciliation): BillingEmailTemplate {
  const status = reconciliation.result?.status;
  if (status === "pending") return "pendente";
  if (status === "partial" || status === "review") return "parcial";
  return "integral";
}

function itemLines(invoice: HalexInvoice) {
  return invoice.items.map(
    (item) => `• ${item.codigoProduto} — ${item.descricao}: ${quantity(item.quantidade)} un`,
  );
}

function pendingLines(reconciliation: InvoiceReconciliation) {
  return (reconciliation.result?.items || [])
    .filter((item) => item.missingQuantity > 0)
    .map((item) => `• ${item.productCode} — ${item.description}: ${quantity(item.missingQuantity)} un`);
}

export function buildInvoiceEmail(
  invoice: HalexInvoice,
  reconciliation: InvoiceReconciliation,
  template: BillingEmailTemplate = suggestBillingTemplate(reconciliation),
) {
  const nf = cleanNumber(invoice.nf);
  const client = invoice.nomeCliente || reconciliation.order?.clientName || "";
  const greeting = client ? `Prezados, equipe ${client},` : "Prezados,";
  const issuedAt = formatDate(invoice.dataFaturamento);
  const orderNumber = reconciliation.order?.orderNumber
    || invoice.pedidoCliente
    || cleanNumber(invoice.ordemVenda);
  const orderReference = orderNumber ? `, referente ao pedido ${orderNumber}` : "";
  const signature = ["", "Atenciosamente,", "Equipe Comercial · Halex Istar"];
  const pending = pendingLines(reconciliation);

  if (template === "pendente") {
    return {
      subject: orderNumber ? `Pedido ${orderNumber} · itens pendentes de faturamento` : "Itens pendentes de faturamento",
      body: [
        greeting,
        "",
        orderNumber
          ? `Informamos que o pedido ${orderNumber} ainda não foi faturado.`
          : "Informamos que o pedido ainda não foi faturado.",
        ...(pending.length ? ["", "Itens pendentes:", ...pending] : []),
        "",
        "Assim que o faturamento for concluído, enviaremos a nota fiscal e a previsão de entrega.",
        ...signature,
      ].join("\n"),
    };
  }

  if (template === "parcial") {
    return {
      subject: `Nota fiscal ${nf}${orderNumber ? ` · Pedido ${orderNumber} faturado parcialmente` : ""}`,
      body: [
        greeting,
        "",
        `Segue anexo o DANFE da nota fiscal ${nf}${issuedAt ? `, emitida em ${issuedAt}` : ""}${orderReference}.`,
        "",
        "Itens faturados nesta nota fiscal:",
        ...itemLines(invoice),
        ...(pending.length ? ["", "Itens com saldo pendente:", ...pending] : []),
        "",
        "Os saldos pendentes serão faturados assim que houver disponibilidade.",
        ...signature,
      ].join("\n"),
    };
  }

  return {
    subject: `Nota fiscal ${nf}${orderNumber ? ` · Pedido ${orderNumber}` : ""}`,
    body: [
      greeting,
      "",
      `Segue anexo o DANFE da nota fiscal ${nf}${issuedAt ? `, emitida em ${issuedAt}` : ""}${orderReference}.`,
      "",
      "Itens faturados:",
      ...itemLines(invoice),
      "",
      orderNumber ? `O pedido ${orderNumber} foi atendido integralmente.` : "O pedido foi atendido integralmente.",
      ...signature,
    ].join("\n"),
  };
}

export function fulfillmentBadge(reconciliation: InvoiceReconciliation) {
  const status = reconciliation.result?.status;
  if (!status) return { label: "Pedido não localizado", tone: "neutral" as const };
  if (status === "full") return { label: "Faturado 100%", tone: "success" as const };
  if (status === "review") return { label: "Conferir divergências", tone: "warning" as const };
  if (status === "partial") return { label: "Faturamento parcial", tone: "warning" as const };
  return { label: "Pedido em aberto", tone: "warning" as const };
}
