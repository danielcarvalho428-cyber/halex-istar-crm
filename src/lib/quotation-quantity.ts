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

export function isFullBoxQuantity(units: number, packSize: number) {
  const safeUnits = Math.trunc(Number(units) || 0);
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  return safeUnits > 0 && safeUnits % safePackSize === 0;
}
