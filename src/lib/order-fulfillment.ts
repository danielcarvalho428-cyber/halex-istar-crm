export type OriginalOrderItem = {
  productCode: string;
  description: string;
  orderedQuantity: number;
};

export type OriginalOrder = {
  orderNumber: string;
  sapOrderNumber: string;
  customerOrderNumber: string;
  clientName: string;
  clientEmail: string;
  createdAt: string;
  items: OriginalOrderItem[];
};

export type InvoicedItem = {
  productCode: string;
  description: string;
  invoicedQuantity: number;
};

export type InvoiceRecord = {
  invoiceNumber: string;
  sapOrderNumber: string;
  customerOrderNumber: string;
  clientCode: string;
  clientName: string;
  invoicedAt: string;
  items: InvoicedItem[];
};

export type FulfillmentItem = OriginalOrderItem & {
  invoicedQuantity: number;
  missingQuantity: number;
  status: "full" | "partial" | "pending";
};

export type FulfillmentResult = {
  order: OriginalOrder;
  invoices: InvoiceRecord[];
  items: FulfillmentItem[];
  status: "full" | "partial" | "pending" | "review";
  issues: string[];
};

export function normalizeBusinessIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .replace(/^0+(?=\d)/, "");
}

function invoiceMatchesOrder(invoice: InvoiceRecord, order: OriginalOrder) {
  const sapOrder = normalizeBusinessIdentifier(order.sapOrderNumber);
  const customerOrder = normalizeBusinessIdentifier(order.customerOrderNumber);

  return (
    (sapOrder !== "" &&
      normalizeBusinessIdentifier(invoice.sapOrderNumber) === sapOrder) ||
    (customerOrder !== "" &&
      normalizeBusinessIdentifier(invoice.customerOrderNumber) === customerOrder)
  );
}

export function reconcileOrder(
  order: OriginalOrder,
  availableInvoices: InvoiceRecord[],
): FulfillmentResult {
  const invoices = availableInvoices.filter((invoice) =>
    invoiceMatchesOrder(invoice, order),
  );
  const issues: string[] = [];
  const invoicedByProduct = new Map<string, number>();

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const productCode = normalizeBusinessIdentifier(item.productCode);
      if (!productCode || item.invoicedQuantity <= 0) continue;
      invoicedByProduct.set(
        productCode,
        (invoicedByProduct.get(productCode) ?? 0) + item.invoicedQuantity,
      );
    }
  }

  const duplicateCodes = new Set<string>();
  const seenCodes = new Set<string>();
  const items = order.items.map((item): FulfillmentItem => {
    const productCode = normalizeBusinessIdentifier(item.productCode);
    if (!productCode) issues.push(`Item sem código: ${item.description}`);
    if (seenCodes.has(productCode)) duplicateCodes.add(productCode);
    seenCodes.add(productCode);

    const invoicedQuantity = invoicedByProduct.get(productCode) ?? 0;
    const missingQuantity = Math.max(0, item.orderedQuantity - invoicedQuantity);
    return {
      ...item,
      invoicedQuantity,
      missingQuantity,
      status:
        invoicedQuantity >= item.orderedQuantity
          ? "full"
          : invoicedQuantity > 0
            ? "partial"
            : "pending",
    };
  });

  if (duplicateCodes.size > 0) {
    issues.push(
      `Códigos repetidos no pedido: ${[...duplicateCodes].filter(Boolean).join(", ")}`,
    );
  }

  const orderedCodes = new Set(
    order.items.map((item) => normalizeBusinessIdentifier(item.productCode)),
  );
  for (const productCode of invoicedByProduct.keys()) {
    if (!orderedCodes.has(productCode)) {
      issues.push(`Produto faturado não encontrado no pedido: ${productCode}`);
    }
  }

  const status = issues.length
    ? "review"
    : items.length > 0 && items.every((item) => item.status === "full")
      ? "full"
      : items.some((item) => item.invoicedQuantity > 0)
        ? "partial"
        : "pending";

  return { order, invoices, items, status, issues };
}

export function createFulfillmentEmail(result: FulfillmentResult) {
  const invoiceNumbers = result.invoices
    .map((invoice) => invoice.invoiceNumber)
    .filter(Boolean);
  const salutation = result.order.clientName
    ? `Olá, equipe ${result.order.clientName},`
    : "Olá,";

  if (result.status === "full") {
    return {
      subject: `Pedido ${result.order.orderNumber} faturado integralmente`,
      body: [
        salutation,
        "",
        `Informamos que o pedido ${result.order.orderNumber} foi faturado integralmente.`,
        invoiceNumbers.length
          ? `Nota(s) fiscal(is): ${invoiceNumbers.join(", ")}.`
          : "A nota fiscal correspondente segue anexa.",
        "",
        "Permanecemos à disposição.",
      ].join("\n"),
    };
  }

  const missing = result.items
    .filter((item) => item.missingQuantity > 0)
    .map(
      (item) =>
        `- ${item.productCode} — ${item.description}: ${item.missingQuantity} unidade(s) pendente(s)`,
    );

  return {
    subject: `Atualização do faturamento do pedido ${result.order.orderNumber}`,
    body: [
      salutation,
      "",
      `O pedido ${result.order.orderNumber} foi faturado parcialmente.`,
      invoiceNumbers.length
        ? `Nota(s) fiscal(is): ${invoiceNumbers.join(", ")}.`
        : "A nota fiscal correspondente segue anexa.",
      "",
      "Itens ainda pendentes:",
      ...missing,
      "",
      "Os itens pendentes serão faturados assim que houver disponibilidade de estoque.",
      "",
      "Permanecemos à disposição.",
    ].join("\n"),
  };
}
