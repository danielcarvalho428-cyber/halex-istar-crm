import test from "node:test";
import assert from "node:assert/strict";
import { isFullBoxQuantity, quotationLineTotal } from "./quotation-quantity.ts";

test("calculates quotation totals from boxes, package quantity, and unit price", () => {
  assert.equal(quotationLineTotal(2, 15, 10), 300);
  assert.equal(quotationLineTotal(1, 200, 1.5), 300);
});

test("accepts units only when they complete full boxes", () => {
  assert.equal(isFullBoxQuantity(30, 15), true);
  assert.equal(isFullBoxQuantity(31, 15), false);
});
