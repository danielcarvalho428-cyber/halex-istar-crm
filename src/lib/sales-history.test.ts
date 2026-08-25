import assert from "node:assert/strict";
import test from "node:test";
import {
  countBySegment,
  detectColumns,
  parseSalesDate,
  parseHalexDetailedMatrix,
  parseSalesMatrix,
  parseSalesNumber,
  segmentFor,
  summarizeClientSales,
  unknownSalesClients,
  type SalesRow,
} from "./sales-history.ts";
import type { CrmClient } from "./crm-preview.ts";

function client(patch: Partial<CrmClient> & { id: string; name: string }): CrmClient {
  return {
    code: "",
    city: "",
    state: "",
    contact: "",
    phone: "",
    email: "",
    lastPurchase: "",
    averageCycleDays: 0,
    nextPurchase: "",
    total12m: 0,
    status: "Em ciclo",
    ...patch,
  };
}

function sale(patch: Partial<SalesRow> & { date: string }): SalesRow {
  return { clientCode: "500024", clientName: "", cnpj: "", document: "", value: 1000, ...patch };
}

test("finds the columns whatever the relatório calls them", () => {
  const columns = detectColumns([
    "Código Cliente", "Razão Social", "CNPJ", "Data de Faturamento", "Nota Fiscal", "Valor Total",
  ]);
  assert.deepEqual(columns, { clientCode: 0, clientName: 1, cnpj: 2, date: 3, document: 4, value: 5 });
});

test("reads pt-BR numbers and both date formats", () => {
  assert.equal(parseSalesNumber("R$ 1.234,56"), 1234.56);
  assert.equal(parseSalesNumber("1234.56"), 1234.56);
  assert.equal(parseSalesNumber(""), 0);
  assert.equal(parseSalesDate("21/06/2026"), "2026-06-21");
  assert.equal(parseSalesDate("2026-06-21"), "2026-06-21");
  assert.equal(parseSalesDate(46_194), "2026-06-21");
  assert.equal(parseSalesDate("sem data"), "");
});

test("skips the rows above the header and anything without a date", () => {
  const result = parseSalesMatrix([
    ["Relatório de vendas — últimos 6 anos"],
    [],
    ["Codigo Cliente", "Cliente", "Data", "NF", "Valor Total"],
    ["500024", "SANTA CASA", "21/06/2026", "465502", "R$ 12.440,10"],
    ["", "TOTAL GERAL", "", "", "R$ 12.440,10"],
  ]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.ignored, 1);
  assert.deepEqual(result.rows[0], {
    clientCode: "500024",
    clientName: "SANTA CASA",
    cnpj: "",
    date: "2026-06-21",
    document: "465502",
    value: 12440.1,
  });
});

test("classifies by how long the client has been away", () => {
  assert.equal(segmentFor(10), "ativo");
  assert.equal(segmentFor(120), "atencao");
  assert.equal(segmentFor(300), "frio");
  assert.equal(segmentFor(500), "perdido");
  assert.equal(segmentFor(1200), "dormente");
});

const clients = [
  client({ id: "ativo", name: "HOSPITAL ATIVO", code: "500024" }),
  client({ id: "frio", name: "HOSPITAL FRIO", code: "500082" }),
  client({ id: "orgao", name: "PREFEITURA", code: "500100", clientType: "orgao_publico" }),
  client({ id: "nunca", name: "SEM COMPRA", code: "500200" }),
];

const rows = [
  sale({ clientCode: "500024", date: "2026-06-01", value: 5000 }),
  sale({ clientCode: "500024", date: "2026-04-01", value: 3000 }),
  sale({ clientCode: "500024", date: "2026-02-01", value: 2000 }),
  sale({ clientCode: "0500082", date: "2025-10-01", value: 9000 }),
  sale({ clientCode: "500100", date: "2026-06-10", value: 40000 }),
];

test("summarizes purchases per client and leaves órgão público out", () => {
  const summaries = summarizeClientSales(clients, rows, { today: "2026-08-25" });

  assert.deepEqual(summaries.map((item) => item.client.id).sort(), ["ativo", "frio", "nunca"]);

  const ativo = summaries.find((item) => item.client.id === "ativo")!;
  assert.equal(ativo.orders, 3);
  assert.equal(ativo.total, 10000);
  assert.equal(ativo.lastPurchase, "2026-06-01");
  assert.equal(ativo.averageIntervalDays, 60);
  // 2026-06-01 to 2026-08-25 is 85 days: still inside the 3 months.
  assert.equal(ativo.segment, "ativo");

  // The código matches even with a leading zero in the relatório.
  const frio = summaries.find((item) => item.client.id === "frio")!;
  assert.equal(frio.orders, 1);
  assert.equal(frio.segment, "frio");

  const nunca = summaries.find((item) => item.client.id === "nunca")!;
  assert.equal(nunca.segment, "sem_compra");
  assert.equal(nunca.orders, 0);
});

test("includes órgão público only when asked", () => {
  const summaries = summarizeClientSales(clients, rows, { today: "2026-08-25", includeOrgaoPublico: true });
  assert.ok(summaries.some((item) => item.client.id === "orgao"));
});

test("flags the client who is late for their own rhythm", () => {
  const [summary] = summarizeClientSales(
    [client({ id: "a", name: "REGULAR", code: "1" })],
    [
      sale({ clientCode: "1", date: "2026-01-01" }),
      sale({ clientCode: "1", date: "2026-02-01" }),
      sale({ clientCode: "1", date: "2026-03-01" }),
    ],
    { today: "2026-06-01" },
  );
  // Buys every ~30 days, silent for 92: overdue even though still "atencao".
  assert.equal(summary.averageIntervalDays, 30);
  assert.equal(summary.overdue, true);
  assert.equal(summary.segment, "atencao");
});

test("counts one purchase per nota, not per linha", () => {
  const [summary] = summarizeClientSales(
    [client({ id: "a", name: "CLIENTE", code: "1" })],
    [
      sale({ clientCode: "1", date: "2026-06-01", value: 100 }),
      sale({ clientCode: "1", date: "2026-06-01", value: 250 }),
    ],
    { today: "2026-06-10" },
  );
  assert.equal(summary.orders, 1);
  assert.equal(summary.total, 350);
});

test("counts the clients of each segment for the summary strip", () => {
  const counts = countBySegment(summarizeClientSales(clients, rows, { today: "2026-08-25" }));
  assert.equal(counts.get("ativo"), 1);
  assert.equal(counts.get("frio"), 1);
  assert.equal(counts.get("sem_compra"), 1);
});

test("groups the relatório clients that are missing from the cadastro", () => {
  const unknown = unknownSalesClients(clients, [
    ...rows,
    sale({ clientCode: "800100", clientName: "HOSPITAL NOVO", date: "2024-05-01", value: 7000 }),
    sale({ clientCode: "0800100", clientName: "", date: "2026-01-15", value: 3000 }),
    sale({ clientCode: "800200", clientName: "CLINICA DESCONHECIDA", cnpj: "06134926000156", date: "2025-03-02", value: 500 }),
  ]);

  // The two linhas of 800100 are one client, so two unknown clients in all.
  assert.equal(unknown.length, 2);
  const novo = unknown.find((item) => item.code === "800100")!;
  assert.equal(novo.name, "HOSPITAL NOVO");
  assert.equal(novo.orders, 2);
  assert.equal(novo.total, 10000);
  assert.equal(novo.firstPurchase, "2024-05-01");
  assert.equal(novo.lastPurchase, "2026-01-15");

  // Whoever is already in the cadastro never shows up here.
  assert.ok(!unknown.some((item) => item.code === "500024"));
});

test("matches by CNPJ before calling a client unknown", () => {
  const unknown = unknownSalesClients(
    [client({ id: "a", name: "HOSPITAL", code: "", cnpj: "06.134.926/0001-56" })],
    [sale({ clientCode: "999999", cnpj: "06134926000156", date: "2026-01-01" })],
  );
  assert.deepEqual(unknown, []);
});

const detailedReport = [
  ["", "", "", "RELAÇÃO DE NOTAS FISCAIS", "", "", "", "", "", "", ""],
  ["PERÍODO DE 01/01/2016 À 25/08/2026", "", "Tipo de Venda: 1", "", "", "", "", "", "", "", ""],
  ["Lançamento", "Faturamento", "Unidade", "Ordem Venda SAP", "NF", "Código Cliente", "Nome Cliente", "Tipo Frete", "Cond. Pgto", "Status", "Pedido Cliente"],
  ["18/04/2019", "22/04/2019", "BP01 - Matriz Goiânia", "0000278439", "000301708", 502957, "502957 - HOSP. EVANGELICO DE RIO VERDE", "CIF", "28 DIAS", "Faturado Total", ""],
  ["", "", "", "", "", "", "", "", "", "", ""],
  ["Cód. Produto", "Desc. Produto", "Qtd. Caixas", "Qtd. Unidades", "Preço Proposto (R$)", "Total Item (R$)", "", "", "", "", ""],
  [4914, "SALINA BALANCEADA SF 250 ML", 1, 50, 23, 1150, "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", ""],
  ["TOTAL NF (R$): R$ 1.150,00", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", ""],
  ["Lançamento", "Faturamento", "Unidade", "Ordem Venda SAP", "NF", "Código Cliente", "Nome Cliente", "Tipo Frete", "Cond. Pgto", "Status", "Pedido Cliente"],
  ["23/04/2019", "24/04/2019", "BP01 - Matriz Goiânia", "0000278606", "000301818", 502615, "502615 - HOSP. SAO LUCAS", "CIF", "30/60 Dias", "Faturado Total", ""],
  ["Cód. Produto", "Desc. Produto", "Qtd. Caixas", "Qtd. Unidades", "Preço Proposto (R$)", "Total Item (R$)", "", "", "", "", ""],
  // O relatório grava parte dos valores com fator de mil: 5100 é R$ 5,10 e o
  // total do item sai como 51102000 em vez de R$ 51.102,00.
  [4131, "CLORETO DE SODIO 0,9% SF 500 ML", 334, 10020, 5100, 51102000, "", "", "", "", ""],
  ["TOTAL NF (R$): R$ 51.102,00", "", "", "", "", "", "", "", "", "", ""],
];

test("lê o relatório detalhado, onde o valor está abaixo do cabeçalho da nota", () => {
  const rows = parseHalexDetailedMatrix(detailedReport);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    clientCode: "502957",
    // O nome vem com o código colado e sai limpo.
    clientName: "HOSP. EVANGELICO DE RIO VERDE",
    cnpj: "",
    // Vale a data do pedido (18/04), não a do faturamento (22/04).
    date: "2019-04-18",
    document: "301708",
    value: 1150,
  });
});

test("usa o TOTAL NF em vez da soma dos itens, que vem com fator de mil", () => {
  const [, segunda] = parseHalexDetailedMatrix(detailedReport);
  assert.equal(segunda.value, 51102);
  assert.equal(segunda.date, "2019-04-23");
});

test("reconhece o relatório detalhado sozinho, sem cair na leitura de tabela", () => {
  const result = parseSalesMatrix(detailedReport);
  assert.equal(result.layout, "detalhado");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.reduce((sum, row) => sum + row.value, 0), 52252);
});

test("sem rodapé TOTAL NF, a soma dos itens vale como valor da nota", () => {
  const rows = parseHalexDetailedMatrix([
    ["Lançamento", "Faturamento", "Unidade", "Ordem Venda SAP", "NF", "Código Cliente", "Nome Cliente"],
    ["18/04/2019", "22/04/2019", "BP01", "0000278439", "000301708", 502957, "502957 - HOSPITAL"],
    ["Cód. Produto", "Desc. Produto", "Qtd. Caixas", "Qtd. Unidades", "Preço Proposto (R$)", "Total Item (R$)"],
    [4914, "SALINA", 1, 50, 23, 1150],
    [4124, "CLORETO", 2, 100, 2.5, 250],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 1400);
});

test("usa a data do pedido mesmo quando a nota sai meses depois", () => {
  // Caso real: um pedido de 19/11/2025 faturado em parcelas até 21/01/2026
  // fazia o cliente parecer que comprou em 2026.
  const rows = parseHalexDetailedMatrix([
    ["Lançamento", "Faturamento", "Unidade", "Ordem Venda SAP", "NF", "Código Cliente", "Nome Cliente"],
    ["19/11/2025", "21/01/2026", "BP01", "0000461902", "000100383", 507940, "507940 - ASTRA FARMA"],
    ["Cód. Produto", "Desc. Produto", "Qtd. Caixas", "Qtd. Unidades", "Preço Proposto (R$)", "Total Item (R$)"],
    [4131, "CLORETO", 10, 300, 3.08, 924],
    ["TOTAL NF (R$): R$ 924,00"],
  ]);

  assert.equal(rows[0].date, "2025-11-19");
});

test("sem data de lançamento, o faturamento ainda vale", () => {
  const rows = parseHalexDetailedMatrix([
    ["Lançamento", "Faturamento", "Unidade", "Ordem Venda SAP", "NF", "Código Cliente", "Nome Cliente"],
    ["", "21/01/2026", "BP01", "0000461902", "000100383", 507940, "507940 - ASTRA FARMA"],
    ["Cód. Produto", "Desc. Produto", "Qtd. Caixas", "Qtd. Unidades", "Preço Proposto (R$)", "Total Item (R$)"],
    [4131, "CLORETO", 10, 300, 3.08, 924],
    ["TOTAL NF (R$): R$ 924,00"],
  ]);

  assert.equal(rows[0].date, "2026-01-21");
});
