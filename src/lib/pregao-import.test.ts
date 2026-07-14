import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchPregaoDescription,
  parsePregaoMatrix,
  parsePregaoWorkbook,
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
    "p-ringer-500", // catalog has only "Ringer com Lactato" as a ringer; must not be NaCl
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
