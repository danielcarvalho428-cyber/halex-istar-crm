import assert from "node:assert/strict";
import test from "node:test";
import {
  createFulfillmentEmail,
  reconcileOrder,
  type InvoiceRecord,
  type OriginalOrder,
} from "./order-fulfillment.ts";

const order: OriginalOrder = {
  orderNumber: "201314",
  sapOrderNumber: "0000479308",
  customerOrderNumber: "655693461 1",
  clientName: "Hospital Exemplo",
  clientEmail: "compras@example.com",
  createdAt: "2026-06-22",
  items: [
    {
      productCode: "004124",
      description: "Produto A",
      orderedQuantity: 100,
    },
    {
      productCode: "40000135",
      description: "Produto B",
      orderedQuantity: 50,
    },
  ],
};

function invoice(
  invoiceNumber: string,
  items: InvoiceRecord["items"],
): InvoiceRecord {
  return {
    invoiceNumber,
    sapOrderNumber: "479308",
    customerOrderNumber: "",
    clientCode: "123",
    clientName: "Hospital Exemplo",
    invoicedAt: "2026-06-29",
    items,
  };
}

test("aggregates split invoices and recognizes full fulfillment", () => {
  const result = reconcileOrder(order, [
    invoice("100", [
      { productCode: "4124", description: "Produto A", invoicedQuantity: 60 },
      {
        productCode: "40000135",
        description: "Produto B",
        invoicedQuantity: 50,
      },
    ]),
    invoice("101", [
      { productCode: "4124", description: "Produto A", invoicedQuantity: 40 },
    ]),
  ]);

  assert.equal(result.status, "full");
  assert.equal(result.items[0].missingQuantity, 0);
  assert.match(createFulfillmentEmail(result).subject, /integralmente/);
});

test("reports exact missing quantities for partial fulfillment", () => {
  const result = reconcileOrder(order, [
    invoice("102", [
      { productCode: "4124", description: "Produto A", invoicedQuantity: 75 },
    ]),
  ]);

  assert.equal(result.status, "partial");
  assert.equal(result.items[0].missingQuantity, 25);
  assert.equal(result.items[1].missingQuantity, 50);
  assert.match(createFulfillmentEmail(result).body, /25 unidade/);
});

test("holds unexpected invoice products for manual review", () => {
  const result = reconcileOrder(order, [
    invoice("103", [
      { productCode: "999999", description: "Produto estranho", invoicedQuantity: 1 },
    ]),
  ]);

  assert.equal(result.status, "review");
  assert.match(result.issues[0], /não encontrado/);
});
