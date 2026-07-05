import assert from "node:assert/strict";
import test from "node:test";
import { formatQuotationPriceInput, parseQuotationPriceInput } from "./quotation-price.ts";

test("parses comma-based input as a decimal value", () => {
  assert.equal(parseQuotationPriceInput("12,50"), 12.5);
  assert.equal(parseQuotationPriceInput("1.234,56"), 1234.56);
  assert.equal(parseQuotationPriceInput("1000"), 1000);
});

test("formats values with fixed two decimal places using comma", () => {
  assert.equal(formatQuotationPriceInput(12.5), "12,50");
  assert.equal(formatQuotationPriceInput("100"), "100,00");
  assert.equal(formatQuotationPriceInput("0"), "0,00");
});
