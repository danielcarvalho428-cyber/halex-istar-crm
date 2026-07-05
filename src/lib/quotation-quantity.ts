export function quotationLineTotal(boxes: number, packSize: number, unitPrice: number) {
  const safeBoxes = Math.max(0, Number(boxes) || 0);
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  const safeUnitPrice = Math.max(0, Number(unitPrice) || 0);
  return safeBoxes * safePackSize * safeUnitPrice;
}

export function isFullBoxQuantity(units: number, packSize: number) {
  const safeUnits = Math.trunc(Number(units) || 0);
  const safePackSize = Math.max(1, Math.trunc(Number(packSize) || 1));
  return safeUnits > 0 && safeUnits % safePackSize === 0;
}
