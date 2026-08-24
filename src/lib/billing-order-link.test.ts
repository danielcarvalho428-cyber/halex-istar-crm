import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientOrders,
  buildInvoiceEmail,
  findOrderForInvoice,
  reconcileInvoice,
  suggestBillingTemplate,
} from "./billing-order-link.ts";
import type { HalexInvoice } from "./halex-bulk-empenho.ts";
import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from "../types/index.ts";

const licitacao = {
  id: "lic-1",
  orgao: "Hospital Exemplo",
  orgao_email: "compras@example.com",
  codigo_cliente: "004321",
  data_abertura: "2026-01-10",
} as unknown as Licitacao;

const itens = [
  { id: "it-1", licitacao_id: "lic-1", codigo_produto: "004124", descricao: "Produto A" },
  { id: "it-2", licitacao_id: "lic-1", codigo_produto: "40000135", descricao: "Produto B" },
] as unknown as LicitacaoItem[];

const empenho = {
  id: "emp-1",
  licitacao_id: "lic-1",
  numero_empenho: "655693461",
  data_empenho: "2026-06-22",
  orgao: "Hospital Exemplo",
} as unknown as Empenho;

const empenhoItens = [
  { id: "ei-1", empenho_id: "emp-1", licitacao_item_id: "it-1", quantidade_empenhada: 100 },
  { id: "ei-2", empenho_id: "emp-1", licitacao_item_id: "it-2", quantidade_empenhada: 50 },
] as unknown as EmpenhoItem[];

const orders = buildClientOrders([licitacao], itens, [empenho], empenhoItens);

function invoice(nf: string, quantities: [number, number]): HalexInvoice {
  return {
    key: `004321|${nf}`,
    numeroEmpenho: `OV ${nf}`,
    nf,
    dataEmpenho: "2026-06-22",
    dataFaturamento: "2026-06-25",
    ordemVenda: "0000479308",
    codigoCliente: "004321",
    nomeCliente: "Hospital Exemplo",
    pedidoCliente: "655693461",
    items: [
      { codigoProduto: "004124", descricao: "Produto A", quantidadeCaixas: 0, quantidade: quantities[0], valorUnitario: 1, valorTotal: quantities[0] },
      { codigoProduto: "40000135", descricao: "Produto B", quantidadeCaixas: 0, quantidade: quantities[1], valorUnitario: 1, valorTotal: quantities[1] },
    ].filter((item) => item.quantidade > 0),
  };
}

test("builds the pedido do cliente from the empenho and its licitação items", () => {
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].items, [
    { productCode: "004124", description: "Produto A", orderedQuantity: 100 },
    { productCode: "40000135", description: "Produto B", orderedQuantity: 50 },
  ]);
  assert.equal(orders[0].clientEmail, "compras@example.com");
});

test("matches the invoice to the pedido by customer order number", () => {
  assert.equal(findOrderForInvoice(orders, invoice("12345", [100, 50]))?.empenhoId, "emp-1");
});

test("reports 100% billing and lists every item in the email", () => {
  const nota = invoice("12345", [100, 50]);
  const reconciliation = reconcileInvoice(nota, [nota], orders);
  assert.equal(reconciliation.result?.status, "full");
  assert.equal(suggestBillingTemplate(reconciliation), "integral");

  const email = buildInvoiceEmail(nota, reconciliation);
  assert.match(email.subject, /^Nota fiscal 12345 · Pedido 655693461$/);
  assert.match(email.body, /004124 — Produto A: 100 un/);
  assert.match(email.body, /40000135 — Produto B: 50 un/);
  assert.match(email.body, /O pedido 655693461 foi atendido integralmente\./);
  // The client is never told about our internal conferência.
  assert.doesNotMatch(email.body, /base|conferência/i);
});

test("lists the pending balance when the pedido is only partially billed", () => {
  const nota = invoice("12345", [40, 0]);
  const reconciliation = reconcileInvoice(nota, [nota], orders);
  assert.equal(reconciliation.result?.status, "partial");
  assert.equal(suggestBillingTemplate(reconciliation), "parcial");

  const email = buildInvoiceEmail(nota, reconciliation);
  assert.match(email.subject, /faturado parcialmente/);
  assert.match(email.body, /Itens faturados nesta nota fiscal:/);
  assert.match(email.body, /Itens com saldo pendente:/);
  assert.match(email.body, /004124 — Produto A: 60 un/);
  assert.match(email.body, /40000135 — Produto B: 50 un/);
});

test("announces a pedido that has not been billed at all", () => {
  const nota = invoice("12345", [0, 0]);
  const reconciliation = reconcileInvoice(nota, [nota], orders);
  assert.equal(suggestBillingTemplate(reconciliation), "pendente");

  const email = buildInvoiceEmail(nota, reconciliation, "pendente");
  assert.match(email.subject, /Pedido 655693461 · itens pendentes/);
  assert.match(email.body, /ainda não foi faturado/);
  assert.match(email.body, /004124 — Produto A: 100 un/);
  assert.doesNotMatch(email.body, /segue anexo/i);
});

test("lets the user pick a template other than the suggested one", () => {
  const nota = invoice("12345", [100, 50]);
  const reconciliation = reconcileInvoice(nota, [nota], orders);
  const parcial = buildInvoiceEmail(nota, reconciliation, "parcial");
  assert.match(parcial.subject, /faturado parcialmente/);
  assert.match(parcial.body, /Os saldos pendentes serão faturados/);
});

test("sums every nota fiscal of the report that settles the same pedido", () => {
  const first = invoice("12345", [40, 0]);
  const second = invoice("12346", [60, 50]);
  const reconciliation = reconcileInvoice(second, [first, second], orders);
  assert.equal(reconciliation.result?.status, "full");
  assert.deepEqual(reconciliation.invoiceNumbers.sort(), ["12345", "12346"]);
});

test("keeps the email short when the pedido is unknown", () => {
  const nota = invoice("12345", [100, 50]);
  const reconciliation = reconcileInvoice(nota, [nota], []);
  assert.equal(reconciliation.result, null);

  const email = buildInvoiceEmail(nota, reconciliation);
  assert.match(email.body, /Segue anexo o DANFE da nota fiscal 12345/);
  assert.match(email.body, /004124 — Produto A: 100 un/);
  assert.doesNotMatch(email.body, /não foi localizado/);
});
