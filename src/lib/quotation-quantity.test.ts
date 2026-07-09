import test from "node:test";
import assert from "node:assert/strict";
import { isFullBoxQuantity, quotationLineTotal, quotationLineUnits, quotationLineTotalFromUnits } from "./quotation-quantity.ts";

test("calculates quotation totals from boxes, package quantity, and unit price", () => {
  assert.equal(quotationLineTotal(2, 15, 10), 300);
  assert.equal(quotationLineTotal(1, 200, 1.5), 300);
});

test("accepts units only when they complete full boxes", () => {
  assert.equal(isFullBoxQuantity(30, 15), true);
  assert.equal(isFullBoxQuantity(31, 15), false);
});

test("line units track the edited field (boxes vs units) so totals never go stale", () => {
  // boxes mode: units = boxes * packSize regardless of unitQuantity
  assert.equal(quotationLineUnits("boxes", 3, undefined, 10), 30);
  assert.equal(quotationLineUnits("boxes", 3, 999, 10), 30);
  // units mode: units come straight from the entered unitQuantity
  assert.equal(quotationLineUnits("units", 3, 40, 10), 40);
  // units mode with a stale/missing box count still reads the entered units
  assert.equal(quotationLineUnits("units", 2, 60, 10), 60);
  // units mode falling back to boxes when unitQuantity is missing
  assert.equal(quotationLineUnits("units", 5, undefined, 10), 50);
});

test("total from units multiplies units by unit price", () => {
  // 40 units at R$2,50/un = R$100 — the value that was going out stale before
  assert.equal(quotationLineTotalFromUnits(40, 2.5), 100);
  assert.equal(quotationLineTotalFromUnits(quotationLineUnits("units", 2, 60, 10), 3), 180);
});
