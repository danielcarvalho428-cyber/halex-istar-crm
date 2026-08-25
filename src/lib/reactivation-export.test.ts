import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReactivationSheets,
  matchReactivationMarks,
  parseReactivationMarks,
  SEM_CARTEIRA,
} from "./reactivation-export.ts";
import { summarizeClientSales, type SalesRow } from "./sales-history.ts";
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

function sale(patch: Partial<SalesRow> & { date: string; clientCode: string }): SalesRow {
  return { clientName: "", cnpj: "", document: "", value: 1000, ...patch };
}

const clients = [
  client({ id: "a", name: "HOSPITAL GRANDE", code: "500024", carteira: "4104", cnpj: "06134926000156", city: "Goiânia", state: "GO" }),
  client({ id: "b", name: "HOSPITAL MEDIO", code: "500082", carteira: "4104" }),
  client({ id: "c", name: "CLINICA MINEIRA", code: "500100", carteira: "4413" }),
  client({ id: "d", name: "HOSPITAL NORTE", code: "500200", carteira: "4648", receitaSituacao: "BAIXADA" }),
  client({ id: "e", name: "SEM EQUIPE", code: "500300" }),
];

const rows = [
  sale({ clientCode: "500024", date: "2026-06-01", value: 50000 }),
  sale({ clientCode: "500082", date: "2025-01-10", value: 8000 }),
  sale({ clientCode: "500100", date: "2024-03-05", value: 12000 }),
  sale({ clientCode: "500200", date: "2023-02-02", value: 3000 }),
  sale({ clientCode: "500300", date: "2026-05-05", value: 1500 }),
];

const summaries = summarizeClientSales(clients, rows, { today: "2026-08-25" });

test("splits the export into one sheet per carteira, in the team order", () => {
  const sheets = buildReactivationSheets(summaries);
  assert.deepEqual(sheets.map((sheet) => sheet.carteira), ["4104", "4413", "4648", SEM_CARTEIRA]);
  assert.equal(sheets[0].rows.length, 2);
  assert.equal(sheets[0].total, 58000);
});

test("puts the biggest client first inside each carteira", () => {
  const [carteira4104] = buildReactivationSheets(summaries);
  assert.deepEqual(carteira4104.rows.map((row) => row.cliente), ["HOSPITAL GRANDE", "HOSPITAL MEDIO"]);
});

test("carries the fields the vendedor needs to decide", () => {
  const [carteira4104] = buildReactivationSheets(summaries);
  const grande = carteira4104.rows[0];
  assert.equal(grande.codigo, "500024");
  assert.equal(grande.cnpj, "06.134.926/0001-56");
  assert.equal(grande.cidade, "Goiânia");
  assert.equal(grande.situacao, "Comprando (até 3 meses)");
  assert.equal(grande.ultimaCompra, "2026-06-01");
  assert.equal(grande.diasSemComprar, 85);
  assert.equal(grande.compras, 1);
  assert.equal(grande.totalPeriodo, 50000);
});

test("marks the CNPJ baixado so nobody works a closed client", () => {
  const norte = buildReactivationSheets(summaries)
    .find((sheet) => sheet.carteira === "4648")!.rows[0];
  assert.equal(norte.cnpjBaixado, "SIM");
  assert.equal(norte.situacao, "Mais de 2 anos sem comprar");
});

test("leaves the days column empty for who never bought in the period", () => {
  const [sheet] = buildReactivationSheets(
    summarizeClientSales([client({ id: "z", name: "NUNCA", code: "9", carteira: "4104" })], [], { today: "2026-08-25" }),
  );
  assert.equal(sheet.rows[0].diasSemComprar, "");
  assert.equal(sheet.rows[0].compras, 0);
  assert.equal(sheet.rows[0].situacao, "Sem compra no período");
});

const markedSheet = [
  ["Código", "Cliente", "CNPJ", "Cidade", "Reconquistar?", "Observações"],
  ["500024", "HOSPITAL GRANDE", "06.134.926/0001-56", "Goiânia", "SIM", "Ligar para o Dr. Carlos"],
  ["500082", "HOSPITAL MEDIO", "", "", "não", ""],
  ["500100", "CLINICA MINEIRA", "", "", "Talvez", "Voltar em janeiro"],
  ["500200", "HOSPITAL NORTE", "", "", "", ""],
  ["999999", "CLIENTE DE FORA", "", "", "SIM", ""],
];

test("lê as marcações da planilha e ignora quem ficou em branco", () => {
  const marks = parseReactivationMarks(markedSheet);

  assert.equal(marks.length, 4);
  assert.deepEqual(marks.map((mark) => mark.decision), ["SIM", "NÃO", "TALVEZ", "SIM"]);
  assert.equal(marks[0].note, "Ligar para o Dr. Carlos");
  assert.equal(marks[0].cnpj, "06134926000156");
});

test("aceita a planilha com colunas fora de ordem e sem cabeçalho na primeira linha", () => {
  const marks = parseReactivationMarks([
    ["Reativação — carteira 4104"],
    [],
    ["Cliente", "Reconquistar?", "Código"],
    ["HOSPITAL GRANDE", "S", "500024"],
  ]);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].decision, "SIM");
  assert.equal(marks[0].code, "500024");
});

test("liga cada marcação ao cadastro e separa quem não existe", () => {
  const { matched, unmatched } = matchReactivationMarks(clients, parseReactivationMarks(markedSheet));

  assert.deepEqual(matched.map((item) => [item.clientId, item.decision]), [
    ["a", "SIM"],
    ["b", "NÃO"],
    ["c", "TALVEZ"],
  ]);
  assert.equal(matched[0].note, "Ligar para o Dr. Carlos");
  assert.deepEqual(unmatched.map((item) => item.name), ["CLIENTE DE FORA"]);
});

test("sem coluna Reconquistar não há o que importar", () => {
  assert.deepEqual(parseReactivationMarks([["Código", "Cliente"], ["1", "X"]]), []);
});
