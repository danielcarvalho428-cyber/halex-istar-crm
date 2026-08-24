const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidCnpj, lookupCnpjs, parseCompany } = require("./cnpj-lookup.cjs");

const payload = {
  cnpj: "06134926000156",
  razao_social: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA",
  ddd_telefone_1: "6332361300",
  municipio: "PALMAS",
  uf: "TO",
  descricao_situacao_cadastral: "ATIVA",
};

function fakeFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      const cnpj = url.split("/").pop();
      const value = responses[cnpj];
      if (!value) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => value };
    },
  };
}

test("validates the CNPJ check digits before spending a request", () => {
  assert.equal(isValidCnpj("06134926000156"), true);
  assert.equal(isValidCnpj("06.134.926/0001-56"), true);
  assert.equal(isValidCnpj("06134926000157"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
  assert.equal(isValidCnpj("123"), false);
});

test("keeps only the fields the cadastro uses", () => {
  assert.deepEqual(parseCompany(payload), {
    cnpj: "06134926000156",
    razaoSocial: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA",
    phone: "6332361300",
    city: "PALMAS",
    state: "TO",
    situacao: "ATIVA",
  });
  // A truncated phone is worse than no phone.
  assert.equal(parseCompany({ ddd_telefone_1: "3236" }).phone, "");
});

test("consults each CNPJ once and reuses the cache", async () => {
  const { calls, fetchImpl } = fakeFetch({ "06134926000156": payload });
  const first = await lookupCnpjs(["06134926000156", "06.134.926/0001-56"], { fetchImpl });

  assert.equal(first.consulted, 1);
  assert.equal(calls.length, 1);
  assert.equal(first.records[0].city, "PALMAS");

  const second = await lookupCnpjs(["06134926000156"], { fetchImpl, cache: first.cache });
  assert.equal(second.consulted, 0);
  assert.equal(calls.length, 1);
  assert.equal(second.records.length, 1);
});

test("reports invalid and failed CNPJs instead of throwing", async () => {
  const { fetchImpl } = fakeFetch({ "06134926000156": payload });
  const result = await lookupCnpjs(["06134926000156", "11111111111111", "33000167000101"], { fetchImpl });

  assert.deepEqual(result.invalid, ["11111111111111"]);
  assert.deepEqual(result.failed, ["33000167000101"]);
  assert.equal(result.records.length, 1);
});

test("stops at the request limit and says how many were left", async () => {
  const { fetchImpl } = fakeFetch({ "06134926000156": payload });
  const result = await lookupCnpjs(["06134926000156", "24334112000147"], { fetchImpl, limit: 1 });
  assert.equal(result.consulted, 1);
  assert.equal(result.skipped, 1);
});
