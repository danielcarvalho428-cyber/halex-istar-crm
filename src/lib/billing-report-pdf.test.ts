import assert from "node:assert/strict";
import test from "node:test";
import { parseBillingReportOcr } from "./billing-report-pdf.ts";

test("parses the scanned Halex sales and billing report", () => {
  const records = parseBillingReportOcr(`
Ordem de venda 201314
Cliente UNIMED REGIONAL SUL GOIAS COOP. DE TRAB. MEDICO Tipo de Ordem Venda Normal
Representante 4104 - BIOSOLUTO REPRESENTACOES COMERCIAIS ME Pedido Cliente 655693461 1
Data Criação 22/06/2026 06:20:13 Origem de Venda SAP: 0000479308
Valor ordem R$ 12440.10 NFe: 000465502 - 21/06/2026
Valor Total Faturado: R$ 12440.10
Código Descrição Quantidade Preço Valor Total Qtd. Faturada Valor Total Faturado
4124 CLORETO DE SODIO 0,9% SF 100 ML 2300 R$ 2.63 R$ 6049 2300 R$ 6049.00
40000135 CLORETO DE SODIO 0,9% 10ML CX 200 AMP 2400 R$ 0.19 R$ 456 2400 R$ 456.00
`);
  assert.equal(records.length, 1);
  assert.equal(records[0].nf, "465502");
  assert.equal(records[0].ordemVenda, "479308");
  assert.equal(records[0].dataFaturamento, "2026-06-21");
  assert.equal(records[0].items.length, 2);
  assert.equal(records[0].items[1].quantidade, 2400);
});

test("keeps the pedido cliente and never swallows the next label", () => {
  const [record] = parseBillingReportOcr(`
Ordem de venda 201314
Cliente UNIMED REGIONAL SUL GOIAS Tipo de Ordem Venda Normal
Representante 4104 - BIOSOLUTO Pedido Cliente 655693461
Data Criação 22/06/2026 06:20:13 Origem de Venda SAP: 0000479308
Valor ordem R$ 100.00 NFe: 000465502 - 21/06/2026
Código Descrição Quantidade Preço Valor Total Qtd. Faturada Valor Total Faturado
4124 CLORETO DE SODIO 0,9% SF 100 ML 10 R$ 2.63 R$ 26.30 10 R$ 26.30
`);
  assert.equal(record.pedidoCliente, "655693461");
});

test("leaves the pedido cliente empty when the report has none", () => {
  // The label is the last one on the line, so the OCR text runs straight into
  // "Data Criação" — that is not a pedido and must not reach the e-mail.
  const [record] = parseBillingReportOcr(`
Ordem de venda 201314
Cliente HOSPITAL ORTOPEDICO CERES LTDA Tipo de Ordem Venda Normal
Representante 4104 - BIOSOLUTO Pedido Cliente
Data Criação 06/08/2026 06:32:15 Origem de Venda SAP: 0000483728
Valor ordem R$ 100.00 NFe: 000468530 - 05/08/2026
Código Descrição Quantidade Preço Valor Total Qtd. Faturada Valor Total Faturado
4132 CLORETO DE SODIO 0,9% SF 1000 ML 600 R$ 2.63 R$ 1578.00 600 R$ 1578.00
`);
  assert.equal(record.pedidoCliente, "");
  assert.equal(record.ordemVenda, "483728");
});
