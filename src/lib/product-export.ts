import type { CrmProduct } from "./crm-preview";

export const EXPORT_BRANDS = ["Halex Istar", "Medicone"] as const;
export type ExportBrand = (typeof EXPORT_BRANDS)[number];

export type ProductExportCell = string | number;
export type ProductExportSheet = {
  brand: ExportBrand;
  fileName: string;
  rows: ProductExportCell[][];
  columnWidths: number[];
};

function normalizeBrand(value: string | undefined): ExportBrand {
  return value?.trim().toLowerCase() === "medicone" ? "Medicone" : "Halex Istar";
}

export function groupProductsByBrand(products: CrmProduct[]) {
  const groups = new Map<ExportBrand, CrmProduct[]>();
  for (const brand of EXPORT_BRANDS) groups.set(brand, []);
  for (const product of products) groups.get(normalizeBrand(product.brand))!.push(product);
  return groups;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// One sheet per brand: a short formal header block, then the item table.
// Price columns are dropped entirely when the list is exported without prices.
export function buildProductSheet(
  brand: ExportBrand,
  products: CrmProduct[],
  options: { withPrices: boolean; issuedAt?: Date },
): ProductExportSheet {
  const { withPrices } = options;
  const issuedAt = options.issuedAt ?? new Date();
  const issuedLabel = new Intl.DateTimeFormat("pt-BR").format(issuedAt);

  const header: ProductExportCell[] = [
    "Código",
    "Produto",
    "Apresentação",
    "Unidade",
    "Embalagem",
  ];
  if (withPrices) header.push("Preço Hospital (R$)", "Preço Distribuidor (R$)");

  const rows: ProductExportCell[][] = [
    [brand],
    [withPrices ? "Tabela de Produtos e Preços" : "Relação de Produtos"],
    [`Emitida em ${issuedLabel}`],
    [`${products.length} item(ns)`],
    [],
    header,
  ];

  const sorted = [...products].sort((a, b) =>
    a.description.localeCompare(b.description, "pt-BR"),
  );
  for (const item of sorted) {
    const packSize = Math.max(1, item.packSize || 1);
    const row: ProductExportCell[] = [
      item.code,
      item.description,
      item.presentation,
      item.unit,
      `Caixa com ${packSize} unidade(s)`,
    ];
    if (withPrices) {
      row.push(
        Number(item.priceHospital ?? item.price ?? 0),
        Number(item.priceDistribuidor ?? item.price ?? 0),
      );
    }
    rows.push(row);
  }

  if (withPrices) {
    rows.push([], ["Preços em reais, sujeitos a alteração sem aviso prévio."]);
  }

  return {
    brand,
    fileName: `${slug(brand)}-produtos${withPrices ? "-com-precos" : "-sem-precos"}-${issuedAt
      .toISOString()
      .slice(0, 10)}.xlsx`,
    rows,
    columnWidths: withPrices ? [14, 46, 44, 10, 24, 20, 22] : [14, 46, 44, 10, 24],
  };
}

// Builds one sheet per brand that actually has items, so an empty brand never
// produces an empty file.
export function buildProductSheets(
  products: CrmProduct[],
  options: { withPrices: boolean; issuedAt?: Date },
): ProductExportSheet[] {
  const groups = groupProductsByBrand(products);
  return EXPORT_BRANDS.filter((brand) => groups.get(brand)!.length > 0).map((brand) =>
    buildProductSheet(brand, groups.get(brand)!, options),
  );
}
