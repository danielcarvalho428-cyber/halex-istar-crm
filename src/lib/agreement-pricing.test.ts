import assert from "node:assert/strict";
import test from "node:test";
import { agreementPriceFor } from "./agreement-pricing.ts";

const groups = [
  {
    clients: [{ id: "client-1" }],
    prices: [{ product_code: "P1", price: 12.34 }],
  },
];

test("uses the special agreement price for a group member", () => {
  assert.equal(agreementPriceFor(groups, "client-1", "P1", 20), 12.34);
});

test("keeps the catalog price when no agreement price exists", () => {
  assert.equal(agreementPriceFor(groups, "client-1", "P2", 20), 20);
  assert.equal(agreementPriceFor(groups, "client-2", "P1", 20), 20);
});
