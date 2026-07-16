import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchPregaoDescription,
  parsePregaoMatrix,
  parsePregaoWorkbook,
  parsePregaoText,
  normalizeText,
  type ProductLike,
} from "./pregao-import.ts";

// A representative slice of the Halex catalog (description + presentation as the
// app stores them).
const catalog: ProductLike[] = [
  { id: "p-nacl09-100", code: "1", description: "Cloreto de Sódio 0,9%", presentation: "Bolsa 100 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-nacl09-250", code: "2", description: "Cloreto de Sódio 0,9%", presentation: "Bolsa 250 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-nacl09-500", code: "3", description: "Cloreto de Sódio 0,9%", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-kcl-10", code: "4", description: "Cloreto de Potássio 10%", presentation: "Ampola 10 ml", brand: "Halex Istar" },
  { id: "p-glic5-500", code: "5", description: "Glicose 5%", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-glic25-10", code: "6", description: "Glicose 25%", presentation: "Ampola 10 ml", brand: "Halex Istar" },
  { id: "p-glic50-10", code: "7", description: "Glicose 50%", presentation: "Ampola 10 ml", brand: "Halex Istar" },
  { id: "p-ringer-500", code: "8", description: "Ringer com Lactato", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-manitol-250", code: "9", description: "Manitol 20%", presentation: "Bolsa 250 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-gluccalc-10", code: "10", description: "Gliconato de Cálcio 10%", presentation: "Ampola 10 ml", brand: "Halex Istar" },
  { id: "p-cipro-100", code: "11", description: "Ciprofloxacino 2 mg/ml", presentation: "Bolsa 100 ml", brand: "Halex Istar" },
  // A non-Halex-ish product that must NOT get matched to unrelated specs.
  { id: "p-agua-10", code: "12", description: "Água para Injeção", presentation: "Frasco 10 ml", brand: "Halex Istar" },
  // Composed-name and brand/generic alias products.
  { id: "p-glicofis-500", code: "13", description: "Glicofisiológico", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-norposil", code: "14", description: "Noprosil", presentation: "Ampola 10 mg/2 ml", brand: "Halex Istar" },
  { id: "p-ondan", code: "15", description: "Ondansetrona 2 mg/ml", presentation: "Ampola 4 ml", brand: "Halex Istar" },
  { id: "p-plasmaistar", code: "16", description: "Plasmaistar", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-ringer-simples-500", code: "18", description: "Ringer Simples", presentation: "Bolsa 500 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-beca", code: "19", description: "Beca 1 mg/ml", presentation: "Ampola 5 ml", brand: "Halex Istar" },
  { id: "p-cymevir", code: "20", description: "Cymevir", presentation: "Bolsa 100 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-quevatryl", code: "21", description: "Quevatryl 0,06 mg/ml", presentation: "Bolsa 50 ml, sistema fechado", brand: "Halex Istar" },
  { id: "p-lowe", code: "22", description: "Lowe 3 mg/ml", presentation: "Ampola 2 ml", brand: "Halex Istar" },
];

function matchId(description: string) {
  return matchPregaoDescription(description, catalog).productId;
}

test("matches sodium chloride specs to the right volume", () => {
  assert.equal(
    matchId("CLORETO DE SÓDIO, PRINCÍPIO ATIVO:0,9%_ SOLUÇÃO INJETÁVEL, APLICAÇÃO:SISTEMA FECHADO 500ML"),
    "p-nacl09-500",
  );
  assert.equal(
    matchId("CLORETO DE SÓDIO, PRINCÍPIO ATIVO:0,9%_ SOLUÇÃO INJETÁVEL, APLICAÇÃO:SISTEMA FECHADO 250ML"),
    "p-nacl09-250",
  );
  assert.equal(
    matchId("CLORETO DE SÓDIO, PRINCÍPIO ATIVO:0,9%_ SOLUÇÃO INJETÁVEL, APLICAÇÃO:SISTEMA FECHADO 100ML"),
    "p-nacl09-100",
  );
});

test("does not confuse potássio with sódio", () => {
  assert.equal(
    matchId("CLORETO DE POTÁSSIO, DOSAGEM:19,1%, APRESENTAÇÃO:SOLUÇÃO INJETÁVEL - 10ML"),
    // No 19,1% potássio in catalog; the 10% one is the only potássio product.
    "p-kcl-10",
  );
});

test("distinguishes glucose concentrations", () => {
  assert.equal(matchId("GLICOSE, CONCENTRAÇÃO:25%, INDICAÇÃO:SOLUÇÃO INJETÁVEL - 10ML"), "p-glic25-10");
  assert.equal(matchId("GLICOSE, CONCENTRAÇÃO:50%, INDICAÇÃO:SOLUÇÃO INJETÁVEL - 10ML"), "p-glic50-10");
  assert.equal(matchId("GLICOSE, CONCENTRAÇÃO:5%, CARACTERÍSTICAS ADICIONAIS:SISTEMA FECHADO 500ML"), "p-glic5-500");
});

test("matches ringer, manitol, gliconato and ciprofloxacino", () => {
  assert.equal(matchId("SOLUÇÃO SORO RINGER COM LACTATO DE SODIO - (BOLSA DE 500 ML)"), "p-ringer-500");
  assert.equal(matchId("MANITOL, DOSAGEM:20%, CARACTERÍSTICAS ADICIONAIS:SISTEMA FECHADO 250 ML"), "p-manitol-250");
  assert.equal(matchId("GLICONATO DE CÁLCIO, DOSAGEM:10%, APRESENTAÇÃO:SOLUÇÃO INJETÁVEL - 10 ML"), "p-gluccalc-10");
  assert.equal(matchId("CIPROFLOXACINO CLORIDRATO, DOSAGEM:2 MG/ML, APRESENTAÇÃO:SOLUÇÃO INJETÁVEL 100ML"), "p-cipro-100");
});

test("returns no match for a substance we do not carry", () => {
  const result = matchPregaoDescription(
    "NITROPRUSSETO DE SÓDIO 25MG/ML - SOLUÇÃO INJETÁVEL, AMPOLA COM 2ML",
    catalog,
  );
  // Nitroprusseto is not in the catalog; "sódio" alone should not be enough to
  // confidently pull a cloreto de sódio bag, so it must not be high confidence.
  assert.notEqual(result.confidence, "high");
});

test("ringer spec that lists cloreto de sódio still matches ringer, not NaCl", () => {
  assert.equal(
    matchId("SOLUÇÃO RINGER SIMPLES 500ML - ESPECIFICAÇÃO: CLORETO DE SÓDIO 8,6 MG/ML + CLORETO DE POTÁSSIO 0,30 MG/ML"),
    "p-ringer-simples-500", // must be the plain ringer, never NaCl
  );
});

test("a substance we do not carry does not confidently borrow another drug's concentration", () => {
  // Cloreto de Sódio 10% is not in the catalog; it must NOT high-confidence match
  // Cloreto de Potássio 10% just because the 10% concentration lines up.
  const result = matchPregaoDescription(
    "CLORETO DE SÓDIO (10%) 100MG/ML - ESPECIFICAÇÃO: SOLUÇÃO PARA DILUIÇÃO",
    catalog,
  );
  assert.notEqual(result.productId, "p-kcl-10");
});

test("composed 'glicose associada ao cloreto de sódio' matches glicofisiológico, not plain glicose", () => {
  assert.equal(
    matchId("GLICOSE, COMPOSIÇÃO:ASSOCIADA AO CLORETO DE SÓDIO, CONCENTRAÇAO:5% + 0,9%, FORMA FARMACEUTICA:SOLUÇÃO INJETÁVEL, CARACTERISTICA ADICIONAL:SISTEMA FECHADO 500ML"),
    "p-glicofis-500",
  );
});

test("plain glicose (no cloreto) still matches glicose, not glicofisiológico", () => {
  assert.equal(
    matchId("GLICOSE, CONCENTRAÇÃO:5%, CARACTERÍSTICAS ADICIONAIS:SISTEMA FECHADO 500ML"),
    "p-glic5-500",
  );
});

test("brand ↔ generic aliases: metoclopramida→Noprosil, nausedron→Ondansetrona", () => {
  assert.equal(
    matchId("METOCLOPRAMIDA 5MG/ML - SOLUÇÃO INJETÁVEL, AMPOLA COM 2ML"),
    "p-norposil",
  );
  assert.equal(
    matchId("NAUSEDRON 2MG/ML - ONDANSETRONA, SOLUÇÃO INJETÁVEL AMPOLA 4ML"),
    "p-ondan",
  );
});

test("more brand ↔ generic aliases: ganciclovir→Cymevir, metoprolol→Beca", () => {
  assert.equal(matchId("GANCICLOVIR 1MG/ML - SOLUÇÃO PARA INFUSÃO, BOLSA 100ML"), "p-cymevir");
  assert.equal(matchId("METOPROLOL 1MG/ML - SOLUÇÃO INJETÁVEL, AMPOLA 5ML"), "p-beca");
});

test("brand ↔ generic aliases: granisetrona→Quevatryl, adenosina→Lowe", () => {
  assert.equal(matchId("GRANISETRONA 0,06MG/ML - SOLUÇÃO PARA INFUSÃO, BOLSA 50ML"), "p-quevatryl");
  assert.equal(matchId("ADENOSINA 3MG/ML - SOLUÇÃO INJETÁVEL, AMPOLA COM 2ML"), "p-lowe");
});

test("plasmaistar recognized from its gluconate+acetate composition, not plain NaCl", () => {
  assert.equal(
    matchId("CLORETO DE SÓDIO, COMPOSIÇÃO:ASSOC. GLICONATO SÓDIO, ACETATO SÓDIO, KCL, MGCL2, CONCENTRAÇAO:5,26 + 5,02 + 3,68 + 0,37 + 0,3 MG/ML, SISTEMA FECHADO 500ML"),
    "p-plasmaistar",
  );
});

test("ringer com lactato recognized from its electrolyte composition", () => {
  assert.equal(
    matchId("SOLUÇÃO ELETROLÍTICA 500ML - SÓDIO 130 MEQ/L, POTÁSSIO 4 MEQ/L, CÁLCIO 2,7 MEQ/L, LACTATO 27,7 MEQ/L, CLORETO 109 MEQ/L"),
    "p-ringer-500",
  );
});

test("normalizeText strips accents and collapses separators", () => {
  assert.equal(normalizeText("SOLUÇÃO_INJETÁVEL  500ML"), "solucao injetavel 500ml");
});

// --- sheet parsing: the two real layouts seen in sample files ---------------

test("parses a well-formed sheet (QNT aligned under its header)", () => {
  const matrix: unknown[][] = [
    ["ITEM", "DESCRIÇÃO", "UND", "QNT", "MARCA", "REG", "V.UNIT", "V.TOTAL", "GRUPOS"],
    [123, "CLORETO DE SÓDIO ... SISTEMA FECHADO 500ML", "BOLSA", 81000, "", "", "", "", "AC"],
    [124, "CLORETO DE SÓDIO ... SISTEMA FECHADO 500ML", "BOLSA", 27000, "", "", "", "", "ME/EPP"],
  ];
  const parsed = parsePregaoMatrix(matrix, "Report");
  assert.ok(parsed);
  assert.equal(parsed.descriptionColumn, 1);
  assert.equal(parsed.quantityColumn, 3);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].quantity, 81000);
  assert.equal(parsed.rows[0].unit, "BOLSA");
});

test("parses a misaligned sheet (quantity sits under the UND header)", () => {
  // Second sample file: data has no separate UND cell, so the number lands one
  // column left of where the QNT header claims.
  const matrix: unknown[][] = [
    ["ITEM", "DESCRIÇÃO", "UND", "QNT", "MARCA", "REG", "V.UNIT", "V.TOTAL"],
    [16, "CLORETO DE SÓDIO 0,9% 250ML - ... SISTEMA FECHADO CONTENDO 250 ML", 2250, "", "", "", "", ""],
    [17, "CLORETO DE SÓDIO 0,9% 500ML - ... SISTEMA FECHADO CONTENDO 500 ML", 1400, "", "", "", "", ""],
  ];
  const parsed = parsePregaoMatrix(matrix, "Planilha1");
  assert.ok(parsed);
  assert.equal(parsed.descriptionColumn, 1);
  assert.equal(parsed.quantityColumn, 2);
  assert.equal(parsed.rows[0].quantity, 2250);
  assert.equal(parsed.rows[1].quantity, 1400);
});

test("parses items from a hospital cotação PDF text layout", () => {
  const text = [
    "Seq. Qtde. Un. Descrição Conv Vl. Unitário Desc. IPI Entrega",
    "72 750,00 Bs Cloreto De Sodio 0,9% Bolsa 500ml 1",
    "7 3.000,00 amp Agua Destilada Ampola 10ml 1",
    "96 20,00 amp Nalbufina 10mg/ml Inj. 1",
    "MARCA: HIPOLABOR",
    "Impresso em: 15/07/2026 16:48:19 Página 2 Marilia WSUP485",
  ].join("\n");
  const parsed = parsePregaoText(text);
  assert.ok(parsed);
  assert.equal(parsed.rows.length, 3); // header, MARCA and footer skipped
  assert.equal(parsed.rows[0].description, "Cloreto De Sodio 0,9% Bolsa 500ml");
  assert.equal(parsed.rows[0].quantity, 750);
  assert.equal(parsed.rows[0].unit, "Bs");
  assert.equal(parsed.rows[1].quantity, 3000); // "3.000,00" → 3000
  assert.equal(parsed.rows[2].description, "Nalbufina 10mg/ml Inj.");
});

test("parses a Bionexo cotação-response report into solicited items", () => {
  const text = [
    "Relatório de resposta da cotação",
    "204 Item",
    "312-ONDANSETRONA 4MG (2MG/ML) - AMPOLA 2ML | Ampola |",
    "BLAU/ NOVAFARMA/HYPOFARMA/HALEX ISTAR/CRISTALIA",
    "Marca Solicitada",
    "BLAU",
    "Qntd. Solicitada",
    "800",
    "Embalagem",
    "Ampola",
    "248 Item",
    "13812-SORO FISIOLOGICO 0.9% (CLORETO DE SODIO 9MG/ML) 100ML - ISENTO PVC | Bolsa | HALEX ISTAR",
    "Qntd. Solicitada",
    "2000",
  ].join("\n");
  const parsed = parsePregaoText(text);
  assert.ok(parsed);
  assert.equal(parsed.sheetName, "Bionexo");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].description, "ONDANSETRONA 4MG (2MG/ML) - AMPOLA 2ML");
  assert.equal(parsed.rows[0].quantity, 800);
  assert.equal(parsed.rows[1].quantity, 2000);
  // The solicited description still matches through the normal engine.
  assert.equal(matchId(parsed.rows[1].description), "p-nacl09-100");
});

test("workbook parse picks the sheet with the most rows", () => {
  const parsed = parsePregaoWorkbook([
    { name: "Empty", matrix: [["nota"], [""]] },
    {
      name: "Report",
      matrix: [
        ["ITEM", "DESCRIÇÃO", "QNT"],
        [1, "GLICOSE 5% 500ML", 100],
        [2, "MANITOL 20% 250ML", 50],
      ],
    },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.sheetName, "Report");
  assert.equal(parsed.rows.length, 2);
});
