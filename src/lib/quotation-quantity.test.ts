import test from "node:test";
import assert from "node:assert/strict";
import {
  isFullBoxQuantity,
  quotationCurrencyValue,
  quotationDisplayUnitPrice,
  quotationLineDisplayTotal,
  quotationLineTotal,
  quotationLineTotalFromUnits,
  quotationLineUnits,
  quotationPriceDraftKey,
  quotationUnitPriceFromDisplay,
} from "./quotation-quantity.ts";

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

test("price display converts between unit and box modes without changing the stored unit price", () => {
  assert.equal(quotationDisplayUnitPrice("units", 2.5, 20), 2.5);
  assert.equal(quotationDisplayUnitPrice("boxes", 2.5, 20), 50);

  assert.equal(quotationUnitPriceFromDisplay("units", 2.5, 20), 2.5);
  assert.equal(quotationUnitPriceFromDisplay("boxes", 50, 20), 2.5);
});

test("price drafts are isolated by quantity mode so stale box prices cannot overwrite unit prices", () => {
  assert.equal(quotationPriceDraftKey("P1", "units"), "P1:units");
  assert.equal(quotationPriceDraftKey("P1", "boxes"), "P1:boxes");
  assert.notEqual(quotationPriceDraftKey("P1", "units"), quotationPriceDraftKey("P1", "boxes"));
});

test("line display totals use the same cents value printed to the client", () => {
  assert.equal(quotationCurrencyValue(0.2989642033224), 0.3);
  assert.equal(quotationLineDisplayTotal("units", 75, 15000, 200, 0.2989642033224), 4500);
  assert.equal(quotationLineDisplayTotal("units", 25, 5000, 200, 0.4473236275200001), 2250);
  assert.equal(quotationLineDisplayTotal("units", 5, 500, 100, 0.92183112), 460);
  assert.equal(quotationLineDisplayTotal("units", 9, 540, 60, 3.6150240000000005), 1954.8);
  assert.equal(quotationLineDisplayTotal("units", 24, 720, 30, 6.426), 4629.6);
  assert.equal(quotationLineDisplayTotal("units", 40, 400, 10, 3.121480188288), 1248);
});

test("box-mode display totals multiply boxes by the displayed box price", () => {
  assert.equal(quotationLineDisplayTotal("boxes", 3, undefined, 20, 0.2989642033224), 17.94);
});
