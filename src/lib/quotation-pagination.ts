export type PaginatedRow<T> = T & { estimatedHeight: number };

// Row-area budgets, in the same abstract units as estimatedProductRowHeight.
// "regular" pages carry only the table; "final" pages must also fit the totals +
// representative block below the table, so their row budget is smaller. Letterhead
// pages reserve extra room because the letterhead art carries a tall multi-line
// address footer at the bottom (standard pages only have a thin one-line footer).
export interface PaginationCapacities {
  firstRegular: number;
  firstFinal: number;
  regular: number;
  final: number;
}

export const STANDARD_CAPACITIES: PaginationCapacities = {
  firstRegular: 184,
  firstFinal: 134,
  regular: 210,
  final: 162,
};

export const LETTERHEAD_CAPACITIES: PaginationCapacities = {
  firstRegular: 176,
  firstFinal: 120,
  regular: 198,
  final: 144,
};

export function estimatedProductRowHeight(description: string, presentation: string) {
  const descriptionLines = Math.max(1, Math.ceil(description.trim().length / 58));
  const presentationLines = presentation.trim()
    ? Math.max(1, Math.ceil(presentation.trim().length / 64))
    : 0;
  return 8.5 + (descriptionLines + presentationLines) * 2.5;
}

function takeRowsWithin<T>(rows: PaginatedRow<T>[], capacity: number) {
  let height = 0;
  let count = 0;

  while (count < rows.length) {
    const nextHeight = rows[count].estimatedHeight;
    if (count > 0 && height + nextHeight > capacity) break;
    height += nextHeight;
    count += 1;
  }

  return Math.max(1, count);
}

export function paginateQuotationRows<T>(
  rows: PaginatedRow<T>[],
  capacities: PaginationCapacities = STANDARD_CAPACITIES,
) {
  if (rows.length === 0) return [] as PaginatedRow<T>[][];

  const pages: PaginatedRow<T>[][] = [];
  let remaining = [...rows];

  while (remaining.length > 0) {
    const firstPage = pages.length === 0;
    const remainingHeight = remaining.reduce(
      (total, row) => total + row.estimatedHeight,
      0,
    );
    const finalCapacity = firstPage ? capacities.firstFinal : capacities.final;
    const regularCapacity = firstPage ? capacities.firstRegular : capacities.regular;
    // If everything left fits within a regular page, this is the last page — so
    // fall back to the smaller final-page budget to leave room for the totals +
    // representative block (and the footer) that must also sit on it. Only when
    // the rows overflow a regular page do more pages follow, so the full budget
    // is safe to use here.
    const capacity = remainingHeight <= regularCapacity
      ? finalCapacity
      : regularCapacity;
    const count = takeRowsWithin(remaining, capacity);
    pages.push(remaining.slice(0, count));
    remaining = remaining.slice(count);
  }

  if (pages.length > 1) {
    const previousPage = pages[pages.length - 2];
    const finalPage = pages[pages.length - 1];
    const finalCapacity = capacities.final;

    while (previousPage.length > 1) {
      const candidate = previousPage[previousPage.length - 1];
      const previousHeight = previousPage.reduce(
        (total, row) => total + row.estimatedHeight,
        0,
      );
      const finalHeight = finalPage.reduce(
        (total, row) => total + row.estimatedHeight,
        0,
      );
      if (finalHeight + candidate.estimatedHeight > finalCapacity) break;
      if (finalHeight >= previousHeight - candidate.estimatedHeight) break;
      finalPage.unshift(previousPage.pop()!);
    }
  }

  return pages.filter((page) => page.length > 0);
}
