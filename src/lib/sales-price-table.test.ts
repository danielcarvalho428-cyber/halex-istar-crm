import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SALES_PRICE_REGION,
  DEFAULT_SALES_PRICE_TABLE,
  isSalesPriceRegion,
  isSalesPriceTable,
} from "./sales-price-table.ts";

test("recognizes valid category and region keys", () => {
  assert.equal(isSalesPriceTable("hospital-ab-fractionated"), true);
  assert.equal(isSalesPriceTable("not-a-table"), false);
  assert.equal(isSalesPriceTable(undefined), false);
  assert.equal(isSalesPriceRegion("n-ne-sul"), true);
  assert.equal(isSalesPriceRegion("mars"), false);
});

test("defaults are themselves valid keys", () => {
  assert.equal(isSalesPriceTable(DEFAULT_SALES_PRICE_TABLE), true);
  assert.equal(isSalesPriceRegion(DEFAULT_SALES_PRICE_REGION), true);
});
