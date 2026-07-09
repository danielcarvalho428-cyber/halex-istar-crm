export type QuotationQuantityMode = "boxes" | "units";

export function quotationLineTotal(boxes: number, packSize: number, unitPrice: number) {
  const safeBoxes = Math.max(0, Number(boxes) || 0);
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  const safeUnitPrice = Math.max(0, Number(unitPrice) || 0);
  return safeBoxes * safePackSize * safeUnitPrice;
}

// Total number of units a line represents, derived directly from whichever field
// the user is editing (unitQuantity in "units" mode, boxes × packSize otherwise).
// This is the single source of truth for totals so a stale box count can never
// leave the displayed/printed total out of date.
export function quotationLineUnits(
  quantityMode: "boxes" | "units" | undefined,
  boxes: number,
  unitQuantity: number | undefined,
  packSize: number,
) {
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  if (quantityMode === "units") {
    const units = unitQuantity ?? Number(boxes) * safePackSize;
    return Math.max(0, Math.trunc(Number(units) || 0));
  }
  return Math.max(0, Math.trunc(Number(boxes) || 0)) * safePackSize;
}

export function quotationLineTotalFromUnits(units: number, unitPrice: number) {
  return Math.max(0, Math.trunc(Number(units) || 0)) * Math.max(0, Number(unitPrice) || 0);
}

export function quotationCurrencyValue(value: number) {
  const safeValue = Math.max(0, Number(value) || 0);
  return Math.round((safeValue + Number.EPSILON) * 100) / 100;
}

export function isFullBoxQuantity(units: number, packSize: number) {
  const safeUnits = Math.trunc(Number(units) || 0);
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  return safeUnits > 0 && safeUnits % safePackSize === 0;
}

export function quotationDisplayUnitPrice(
  quantityMode: QuotationQuantityMode | undefined,
  unitPrice: number,
  packSize: number,
) {
  const safeUnitPrice = Math.max(0, Number(unitPrice) || 0);
  if (quantityMode === "units") return safeUnitPrice;
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  return safeUnitPrice * safePackSize;
}

export function quotationUnitPriceFromDisplay(
  quantityMode: QuotationQuantityMode | undefined,
  displayPrice: number,
  packSize: number,
) {
  const safeDisplayPrice = Math.max(0, Number(displayPrice) || 0);
  if (quantityMode === "units") return safeDisplayPrice;
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  return safeDisplayPrice / safePackSize;
}

export function quotationLineDisplayTotal(
  quantityMode: QuotationQuantityMode | undefined,
  boxes: number,
  unitQuantity: number | undefined,
  packSize: number,
  unitPrice: number,
) {
  const safeBoxes = Math.max(0, Math.trunc(Number(boxes) || 0));
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  if (quantityMode === "units") {
    const units = quotationLineUnits(quantityMode, boxes, unitQuantity, safePackSize);
    return quotationCurrencyValue(units * quotationCurrencyValue(unitPrice));
  }
  return quotationCurrencyValue(
    safeBoxes * quotationCurrencyValue(quotationDisplayUnitPrice(quantityMode, unitPrice, safePackSize)),
  );
}

export function quotationPriceDraftKey(
  productId: string,
  quantityMode: QuotationQuantityMode | undefined,
) {
  return `${productId}:${quantityMode === "units" ? "units" : "boxes"}`;
}
