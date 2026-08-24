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

export function buildInvoiceEmail(invoice: HalexInvoice, reconciliation: InvoiceReconciliation) {
  const nf = cleanNumber(invoice.nf);
  const client = invoice.nomeCliente || reconciliation.order?.clientName || "";
  const greeting = client ? `Prezados, equipe ${client},` : "Prezados,";
  const issuedAt = formatDate(invoice.dataFaturamento);
  const orderNumber = reconciliation.order?.orderNumber
    || invoice.pedidoCliente
    || invoice.numeroEmpenho.replace(/^(OV|NF)\s*/i, "");
  const references = [
    orderNumber ? `pedido ${orderNumber}` : "",
    invoice.ordemVenda ? `ordem de venda SAP ${cleanNumber(invoice.ordemVenda)}` : "",
  ].filter(Boolean);

  const opening = `Informamos o faturamento da nota fiscal ${nf}${issuedAt ? `, emitida em ${issuedAt}` : ""}${
    references.length ? `, referente ao ${references.join(" · ")}` : ""
  }. O DANFE correspondente segue anexo a este e-mail.`;

  const lines = [
    greeting,
    "",
    opening,
    "",
    "Itens faturados nesta nota fiscal:",
    ...invoice.items.map(
      (item) => `• ${item.codigoProduto} — ${item.descricao}: ${quantity(item.quantidade)} un`,
    ),
  ];
  let subject = `Nota fiscal ${nf}${orderNumber ? ` · Pedido ${orderNumber}` : ""}${client ? ` · ${client}` : ""}`;

  const result = reconciliation.result;
  if (!result) {
    lines.push(
      "",
      "O pedido correspondente não foi localizado na nossa base para conferência automática. Pedimos a gentileza de confrontar os itens acima com o pedido emitido.",
    );
  } else {
    const pending = result.items.filter((item) => item.missingQuantity > 0);
    const otherInvoices = reconciliation.invoiceNumbers.filter((number) => number !== nf);

    lines.push(
      "",
      `Conferência com o pedido ${result.order.orderNumber}:`,
      ...result.items.map((item) => {
        const label = `• ${item.productCode} — ${item.description}: ${quantity(item.invoicedQuantity)} de ${quantity(item.orderedQuantity)} un`;
        if (item.status === "full") return `${label} — atendido integralmente`;
        if (item.status === "partial") return `${label} — saldo pendente de ${quantity(item.missingQuantity)} un`;
        return `${label} — ainda não faturado`;
      }),
    );
    if (otherInvoices.length) {
      lines.push("", `Notas fiscais emitidas para este pedido: ${[nf, ...otherInvoices].join(", ")}.`);
    }

    if (result.status === "full") {
      subject = `Pedido ${result.order.orderNumber} faturado integralmente · NF ${nf}`;
      lines.push("", "O pedido foi atendido integralmente: 100% dos itens solicitados foram faturados.");
    } else if (pending.length) {
      subject = `Pedido ${result.order.orderNumber} faturado parcialmente · NF ${nf}`;
      lines.push(
        "",
        "Itens ainda pendentes de faturamento:",
        ...pending.map(
          (item) => `• ${item.productCode} — ${item.description}: ${quantity(item.missingQuantity)} un`,
        ),
        "",
        "Os saldos pendentes serão faturados assim que houver disponibilidade, e a previsão de entrega será informada em seguida.",
      );
    }

    if (result.issues.length) {
      lines.push("", "Pontos para conferência:", ...result.issues.map((issue) => `• ${issue}`));
    }
  }

  lines.push(
    "",
    "Solicitamos a gentileza de confirmar o recebimento e de nos informar qualquer divergência identificada.",
    "",
    "Permanecemos à disposição para os esclarecimentos necessários.",
    "",
    "Atenciosamente,",
    "Equipe Comercial · Halex Istar",
  );

  return { subject, body: lines.join("\n") };
}

export function fulfillmentBadge(reconciliation: InvoiceReconciliation) {
  const status = reconciliation.result?.status;
  if (!status) return { label: "Pedido não localizado", tone: "neutral" as const };
  if (status === "full") return { label: "Faturado 100%", tone: "success" as const };
  if (status === "review") return { label: "Conferir divergências", tone: "warning" as const };
  if (status === "partial") return { label: "Faturamento parcial", tone: "warning" as const };
  return { label: "Pedido em aberto", tone: "warning" as const };
}
