import assert from "node:assert/strict";
import test from "node:test";
import {
  clientCodeRank,
  clientIdentityLabel,
  findDuplicateClientGroups,
  formatCnpj,
  normalizeCnpj,
  quarantinedClientIds,
} from "./client-duplicates.ts";
import type { CrmClient } from "./crm-preview.ts";

function client(patch: Partial<CrmClient> & { id: string }): CrmClient {
  return {
    code: "",
    name: "Cliente",
    city: "Goiânia",
    state: "GO",
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

test("normalizes and formats a CNPJ regardless of punctuation", () => {
  assert.equal(normalizeCnpj("12.345.678/0001-90"), "12345678000190");
  assert.equal(formatCnpj("12345678000190"), "12.345.678/0001-90");
  assert.equal(formatCnpj(""), "");
});

test("groups cadastros that repeat a CNPJ written differently", () => {
  const groups = findDuplicateClientGroups([
    client({ id: "a", code: "1001", cnpj: "12.345.678/0001-90", total12m: 5000, lastPurchase: "2026-06-01" }),
    client({ id: "b", code: "1002", cnpj: "12345678000190", total12m: 0 }),
    client({ id: "c", code: "1003", cnpj: "98.765.432/0001-12" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].document, "12345678000190");
  assert.equal(groups[0].keeper.id, "a");
  assert.deepEqual(groups[0].duplicates.map((item) => item.id), ["b"]);
});

test("keeps the six-digit código even when the longer one has the history", () => {
  const [group] = findDuplicateClientGroups([
    client({ id: "long", code: "3001234567", cnpj: "12345678000190", total12m: 90000, lastPurchase: "2026-07-02" }),
    client({ id: "canonical", code: "300123", cnpj: "12345678000190", total12m: 0 }),
  ]);
  assert.equal(group.keeper.id, "canonical");
  assert.deepEqual(group.duplicates.map((item) => item.id), ["long"]);
});

test("ranks códigos by shape: six digits, shorter, longer, missing", () => {
  assert.equal(clientCodeRank("300123"), 0);
  assert.equal(clientCodeRank("3001"), 1);
  assert.equal(clientCodeRank("3001234567"), 2);
  assert.equal(clientCodeRank(""), 3);
  // Punctuation never changes the shape of a código.
  assert.equal(clientCodeRank("300-123"), 0);
});

test("prefers the shortest código when none has six digits", () => {
  const [group] = findDuplicateClientGroups([
    client({ id: "longest", code: "300123456789", cnpj: "12345678000190", total12m: 90000 }),
    client({ id: "shorter", code: "30012345", cnpj: "12345678000190" }),
  ]);
  assert.equal(group.keeper.id, "shorter");
});

test("keeps the cadastro with the strongest purchase history", () => {
  const [group] = findDuplicateClientGroups([
    client({ id: "old", code: "2001", cnpj: "12345678000190", total12m: 100, lastPurchase: "2024-01-10" }),
    client({ id: "active", code: "2002", cnpj: "12345678000190", total12m: 90000, lastPurchase: "2026-07-02" }),
  ]);
  assert.equal(group.keeper.id, "active");
  assert.deepEqual(group.duplicates.map((item) => item.id), ["old"]);
});

test("ignores cadastros without a complete CNPJ", () => {
  const groups = findDuplicateClientGroups([
    client({ id: "a", cnpj: "" }),
    client({ id: "b", cnpj: "" }),
    client({ id: "c", cnpj: "123" }),
    client({ id: "d", cnpj: "123" }),
  ]);
  assert.deepEqual(groups, []);
});

test("quarantines every duplicate but never the kept cadastro", () => {
  const ids = quarantinedClientIds([
    client({ id: "a", code: "1", cnpj: "12345678000190", total12m: 10 }),
    client({ id: "b", code: "2", cnpj: "12345678000190" }),
    client({ id: "c", code: "3", cnpj: "12345678000190" }),
  ]);
  assert.deepEqual([...ids].sort(), ["b", "c"]);
});

test("always exposes código and CNPJ for the cards", () => {
  assert.deepEqual(clientIdentityLabel(client({ id: "a", code: "1001", cnpj: "12345678000190" })), {
    code: "Código 1001",
    cnpj: "CNPJ 12.345.678/0001-90",
    hasCnpj: true,
  });
  assert.deepEqual(clientIdentityLabel(client({ id: "b" })), {
    code: "Código não informado",
    cnpj: "CNPJ não informado",
    hasCnpj: false,
  });
});
