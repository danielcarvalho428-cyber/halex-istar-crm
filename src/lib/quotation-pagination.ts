export type PaginatedRow<T> = T & { estimatedHeight: number };

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

export function paginateQuotationRows<T>(rows: PaginatedRow<T>[]) {
  if (rows.length === 0) return [] as PaginatedRow<T>[][];

  const pages: PaginatedRow<T>[][] = [];
  let remaining = [...rows];

  while (remaining.length > 0) {
    const firstPage = pages.length === 0;
    const remainingHeight = remaining.reduce(
      (total, row) => total + row.estimatedHeight,
      0,
    );
    const finalCapacity = firstPage ? 134 : 162;
    const regularCapacity = firstPage ? 184 : 210;
    const capacity = remainingHeight <= finalCapacity
      ? finalCapacity
      : regularCapacity;
    const count = takeRowsWithin(remaining, capacity);
    pages.push(remaining.slice(0, count));
    remaining = remaining.slice(count);
  }

  if (pages.length > 1) {
    const previousPage = pages[pages.length - 2];
    const finalPage = pages[pages.length - 1];
    const finalCapacity = 162;

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
