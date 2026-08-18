const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyClientType,
  documentValue,
  carteiraValue,
  clientRowsFromSheets,
} = require("./client-import.cjs");

const noDate = () => null;

test("classifies secretarias, fundos and prefeituras as órgão público", () => {
  for (const name of [
    "FUNDO MUNIC. DE SAUDE - IPORA",
    "PREFEITURA MUNICIPAL DE JATAI",
    "SECRETARIA DE ESTADO DA SAUDE",
    "MUNICIPIO DE PORANGATU",
    "CONSORCIO INTERMUNICIPAL DE SAUDE",
  ])
    assert.equal(classifyClientType(name, ""), "orgao_publico", name);
});

test("classifies distribuidores and falls back to hospital", () => {
  assert.equal(classifyClientType("RIO FARMA DISTRIBUIDORA DE MEDICAME", ""), "distribuidor");
  assert.equal(classifyClientType("HOSP.SANTA TEREZINHA LTDA", ""), "hospital");
  assert.equal(classifyClientType("COP - CENTRO ONCOLOGICO DE PALMAS", ""), "hospital");
});

test("an explicit type column wins over the name heuristic", () => {
  assert.equal(classifyClientType("FUNDO MUNICIPAL DE SAUDE", "Distribuidor"), "distribuidor");
  assert.equal(classifyClientType("HOSPITAL X", "Órgão Público"), "orgao_publico");
});

test("pads documents Excel stripped leading zeros from", () => {
  assert.equal(documentValue(6070954000157), "06070954000157");
  assert.equal(documentValue("12.345.678/0001-90"), "12345678000190");
  assert.equal(documentValue(0), "");
  assert.equal(documentValue(""), "");
});

test("falls back to the sheet name for the carteira", () => {
  assert.equal(carteiraValue(4413, "4104"), "4413");
  assert.equal(carteiraValue("", "4104"), "4104");
  assert.equal(carteiraValue("", "Plan1"), "");
});

test("maps the carteira spreadsheet layout", () => {
  const [row] = clientRowsFromSheets(
    [
      {
        name: "4104",
        rows: [
          {
            CNPJ: 6070954000157,
            Codigo: 500005,
            Nome: "FUNDO MUNIC. DE SAUDE DE SANTA",
            Cidade: "SANTA TEREZA DE GOIAS",
            UF: "GO",
            CARTEIRA: 4104,
          },
        ],
      },
    ],
    noDate,
  );
  assert.deepEqual(
    {
      code: row.code,
      name: row.name,
      document: row.document,
      city: row.city,
      state: row.state,
      carteira: row.carteira,
      client_type: row.client_type,
    },
    {
      code: "500005",
      name: "FUNDO MUNIC. DE SAUDE DE SANTA",
      document: "06070954000157",
      city: "SANTA TEREZA DE GOIAS",
      state: "GO",
      carteira: "4104",
      client_type: "orgao_publico",
    },
  );
});
