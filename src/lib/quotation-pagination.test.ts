import test from "node:test";
import assert from "node:assert/strict";
import {
  estimatedProductRowHeight,
  paginateQuotationRows,
  LETTERHEAD_CAPACITIES,
  STANDARD_CAPACITIES,
  type PaginatedRow,
} from "./quotation-pagination.ts";

function rows(count: number, height = 11.5): PaginatedRow<{ id: number }>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    estimatedHeight: height,
  }));
}

function pageHeights<T>(pages: PaginatedRow<T>[][]) {
  return pages.map((page) =>
    page.reduce((total, row) => total + row.estimatedHeight, 0),
  );
}

test("a single row renders on one page", () => {
  const pages = paginateQuotationRows(rows(1));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 1);
});

test("the last page reserves room for the totals block instead of overfilling", () => {
  // 32 short rows: the two-page UNIMED proposta that was overlapping the footer.
  // The final page must stay within the reduced final-page budget so the totals +
  // representative block has room below the table.
  const pages = paginateQuotationRows(rows(32), STANDARD_CAPACITIES);
  assert.ok(pages.length >= 2, "expected the rows to span multiple pages");
  const last = pageHeights(pages).at(-1)!;
  assert.ok(
    last <= STANDARD_CAPACITIES.final,
    `final page height ${last} must not exceed final budget ${STANDARD_CAPACITIES.final}`,
  );
});

test("letterhead pages reserve more room than standard pages", () => {
  const standard = paginateQuotationRows(rows(32), STANDARD_CAPACITIES);
  const letterhead = paginateQuotationRows(rows(32), LETTERHEAD_CAPACITIES);
  const standardLast = pageHeights(standard).at(-1)!;
  const letterheadLast = pageHeights(letterhead).at(-1)!;
  assert.ok(
    letterheadLast <= LETTERHEAD_CAPACITIES.final,
    `letterhead final page height ${letterheadLast} exceeds budget ${LETTERHEAD_CAPACITIES.final}`,
  );
  assert.ok(
    LETTERHEAD_CAPACITIES.final < STANDARD_CAPACITIES.final,
    "letterhead final budget should be smaller than standard",
  );
  // Every non-final page stays within the regular budget.
  for (const height of pageHeights(letterhead).slice(0, -1)) {
    assert.ok(height <= LETTERHEAD_CAPACITIES.regular);
  }
});

test("no page ever exceeds the regular budget for its type", () => {
  for (const count of [3, 7, 16, 17, 25, 40, 60]) {
    const pages = paginateQuotationRows(rows(count), STANDARD_CAPACITIES);
    pages.forEach((page, index) => {
      const height = page.reduce((total, row) => total + row.estimatedHeight, 0);
      const budget = index === 0
        ? STANDARD_CAPACITIES.firstRegular
        : STANDARD_CAPACITIES.regular;
      // A single tall row is always allowed to occupy its own page.
      assert.ok(
        page.length === 1 || height <= budget,
        `page ${index + 1} of ${count}-row doc: ${height} > ${budget}`,
      );
    });
  }
});

test("row height estimate grows with wrapped description and presentation lines", () => {
  const short = estimatedProductRowHeight("AGUA P/ INJECAO 10ML", "");
  const long = estimatedProductRowHeight(
    "HIFLOXAN (CIPROFLOXACINO) 400MG PE 200ML COM APRESENTACAO EXTRA LONGA",
    "Frasco-ampola com sistema fechado de longa descricao adicional",
  );
  assert.ok(long > short);
});
