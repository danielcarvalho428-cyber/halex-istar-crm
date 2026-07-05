export const SALES_PRICE_TABLES = [
  { value: "distributor-dedicated", label: "Distribuidores e Revendedores · Dedicado" },
  { value: "distributor-fractionated", label: "Distribuidores e Revendedores · Fracionado" },
  { value: "hospital-aa-dedicated", label: "Hospital AA e A / Contratos Redes · Dedicado" },
  { value: "hospital-aa-fractionated", label: "Hospital AA e A / Contratos Redes · Fracionado" },
  { value: "hospital-ab-fractionated", label: "Hospital B e C · Fracionado" },
  { value: "hospital-cd-fractionated", label: "Hospital D · Fracionado" },
] as const;

export type SalesPriceTable = (typeof SALES_PRICE_TABLES)[number]["value"];

export const DEFAULT_SALES_PRICE_TABLE: SalesPriceTable = "hospital-ab-fractionated";

export const SALES_PRICE_REGIONS = [
  { value: "co-to-ba-sp-rj-es-mg", label: "CO / TO / BA / SP / RJ / ES / MG" },
  { value: "n-ne-sul", label: "N / NE / Sul (exceto BA e TO)" },
] as const;

export type SalesPriceRegion = (typeof SALES_PRICE_REGIONS)[number]["value"];
export const DEFAULT_SALES_PRICE_REGION: SalesPriceRegion = "co-to-ba-sp-rj-es-mg";

export function isSalesPriceTable(value: string | undefined): value is SalesPriceTable {
  return SALES_PRICE_TABLES.some((table) => table.value === value);
}

export function isSalesPriceRegion(value: string | undefined): value is SalesPriceRegion {
  return SALES_PRICE_REGIONS.some((region) => region.value === value);
}
