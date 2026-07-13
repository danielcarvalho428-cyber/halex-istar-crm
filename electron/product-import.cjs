function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function field(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === alias);
    if (found && found[1] !== "") return found[1];
  }
  return null;
}

function numberValue(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text || !/[0-9]/.test(text)) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function productRows(rows) {
  return rows.map((row) => ({
    code: String(
      field(row, [
        "cod",
        "codigo",
        "codprod",
        "codigoproduto",
        "codproduto",
        "coderpproduto",
        "sku",
      ]) || "",
    ).trim(),
    description: String(
      field(row, ["descricao", "produto", "nomedoproduto", "nomeproduto"]) ||
        "",
    ).trim(),
    presentation: String(
      field(row, ["apresentacao", "apresentacao2", "embalagem"]) || "",
    ).trim(),
    brand: String(field(row, ["brand", "marca", "fabricante", "laboratorio"]) || "Halex Istar").trim(),
    unit: String(field(row, ["unidade", "un", "unidademedida"]) || "UN").trim(),
    price: numberValue(
      field(row, [
        "preco",
        "precotabela",
        "valorunitario",
        "valor",
        "precodevenda",
      ]),
    ) ?? 0,
    minimum_price: numberValue(field(row, ["precominimo", "valorminimo"])),
    pack_size: numberValue(field(row, ["caixacom", "quantidadeporcaixa", "qtdporcaixa", "unidadesporcaixa"])),
  }));
}

function categoryDefinition(parent, child) {
  const group = normalizeHeader(parent);
  const mode = normalizeHeader(child).includes("dedicado") ? "dedicated" : "fractionated";
  if (group.includes("distribuidores") || group.includes("revendedores")) {
    return {
      value: `distributor-${mode}`,
      label: `Distribuidores e Revendedores · ${mode === "dedicated" ? "Dedicado" : "Fracionado"}`,
    };
  }
  if (group.includes("hospitalaa") || group.includes("contratosredes")) {
    return {
      value: `hospital-aa-${mode}`,
      label: `Hospital AA e A / Contratos Redes · ${mode === "dedicated" ? "Dedicado" : "Fracionado"}`,
    };
  }
  if (group.includes("hospitalbec") || group.includes("hospitalab")) {
    return { value: "hospital-ab-fractionated", label: "Hospital B e C · Fracionado" };
  }
  if (group.includes("hospitald") || group.includes("hospitalcd")) {
    return { value: "hospital-cd-fractionated", label: "Hospital D · Fracionado" };
  }
  return null;
}

function regionDefinition(sheetName) {
  const normalized = normalizeHeader(sheetName);
  if (normalized.includes("nnesul") || normalized.includes("nordestesul")) {
    return { value: "n-ne-sul", label: "N / NE / Sul (exceto BA e TO)" };
  }
  return { value: "co-to-ba-sp-rj-es-mg", label: "CO / TO / BA / SP / RJ / ES / MG" };
}

function columnsFromHeaders(rows, headerIndex) {
  const parentHeaders = rows[headerIndex - 1] || [];
  const childHeaders = rows[headerIndex] || [];
  let currentParent = "";
  const columns = [];
  for (let column = 2; column < Math.max(parentHeaders.length, childHeaders.length); column += 1) {
    if (String(parentHeaders[column] || "").trim()) currentParent = parentHeaders[column];
    const definition = categoryDefinition(currentParent, childHeaders[column]);
    if (definition) columns.push({ column, ...definition });
  }
  return columns;
}

function salesPriceTableFromSheets(sheets, sourceName) {
  if (!Array.isArray(sheets) || sheets.length === 0) return null;
  const firstRows = sheets[0]?.rows || [];
  const headerIndex = firstRows.findIndex((row) =>
    normalizeHeader(row?.[0]) === "cod" && normalizeHeader(row?.[1]).includes("produto"),
  );
  if (headerIndex < 1 || columnsFromHeaders(firstRows, headerIndex).length < 1) return null;

  const categoryMap = new Map();
  const regions = [];
  const products = new Map();
  const prices = {};
  let invalidPrices = 0;

  for (const sheet of sheets) {
    const rows = sheet.rows || [];
    const sheetHeaderIndex = rows.findIndex((row) =>
      normalizeHeader(row?.[0]) === "cod" && normalizeHeader(row?.[1]).includes("produto"),
    );
    if (sheetHeaderIndex < 1) continue;
    // Resolve price columns from THIS sheet's headers — sheets may order or
    // offset their category columns differently, so a first-sheet map would
    // read the wrong category for the others.
    const columns = columnsFromHeaders(rows, sheetHeaderIndex);
    if (columns.length < 1) continue;
    for (const { value, label } of columns) {
      if (!categoryMap.has(value)) categoryMap.set(value, { value, label });
    }
    const region = regionDefinition(sheet.name);
    if (!regions.some((item) => item.value === region.value)) regions.push(region);
    prices[region.value] ||= {};
    for (const { value } of columns) prices[region.value][value] ||= {};

    for (const row of rows.slice(sheetHeaderIndex + 1)) {
      const code = String(row?.[0] || "").trim();
      const description = String(row?.[1] || "").trim();
      if (!code || !description) continue;
      products.set(code, { code, description });
      for (const definition of columns) {
        const price = numberValue(row[definition.column]);
        if (price == null || price < 0) {
          invalidPrices += 1;
          continue;
        }
        prices[region.value][definition.value][code] = price;
      }
    }
  }
  if (regions.length === 0 || products.size === 0) return null;
  const categories = Array.from(categoryMap.values());

  let fallbackPrices = 0;
  const baseRegion = regions[0].value;
  for (const region of regions.slice(1)) {
    for (const category of categories) {
      const target = (prices[region.value][category.value] ||= {});
      for (const code of products.keys()) {
        if (target[code] == null) {
          const fallback = prices[baseRegion]?.[category.value]?.[code];
          if (fallback != null) {
            target[code] = fallback;
            fallbackPrices += 1;
          }
        }
      }
    }
  }

  const periodMatch = String(sourceName || "").match(/(0[1-9]|1[0-2])[.\-_]?(20\d{2})/);
  const period = periodMatch ? `${periodMatch[1]}.${periodMatch[2]}` : "Tabela importada";
  return {
    name: String(sourceName || period),
    period,
    importedAt: new Date().toISOString(),
    regions,
    categories,
    products: Array.from(products.values()),
    prices,
    invalidPrices,
    fallbackPrices,
  };
}

// The Medicone workbook is a single flat sheet with two price tiers
// (Distribuidor / Hospital) rather than the Halex region×category layout:
//
//   Grupo | Código | Descrição do Produto | QTDE CX | IPI | ICMS |
//   Tabela Distribuidor (Unit.) | Condições | Tabela Hospital (Unit.) | Condições
//
// It becomes a sales table with a single "default" region and two categories,
// so a Medicone line is priced by the client's type (hospital vs distribuidor).
function mediconeSalesTableFromSheets(sheets, sourceName) {
  if (!Array.isArray(sheets) || sheets.length === 0) return null;
  const rows = sheets[0]?.rows || [];
  const headerIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const hasCode = row.some((cell) => normalizeHeader(cell) === "codigo");
    const hasDescription = row.some((cell) => normalizeHeader(cell).includes("descricao"));
    return hasCode && hasDescription;
  });
  if (headerIndex < 0) return null;

  const header = rows[headerIndex].map((cell) => normalizeHeader(cell));
  const findColumn = (predicate) => header.findIndex(predicate);
  const codeColumn = findColumn((value) => value === "codigo");
  const descriptionColumn = findColumn((value) => value.includes("descricao"));
  const groupColumn = findColumn((value) => value === "grupo");
  const packColumn = findColumn((value) => value.includes("qtde"));
  const distributorColumn = findColumn((value) => value.includes("distribuidor"));
  const hospitalColumn = findColumn((value) => value.includes("hospital"));
  if (codeColumn < 0 || descriptionColumn < 0 || (distributorColumn < 0 && hospitalColumn < 0)) {
    return null;
  }

  const products = new Map();
  const distributorPrices = {};
  const hospitalPrices = {};
  let invalidPrices = 0;
  let currentGroup = "";

  for (const row of rows.slice(headerIndex + 1)) {
    if (!Array.isArray(row)) continue;
    if (groupColumn >= 0 && String(row[groupColumn] || "").trim()) {
      currentGroup = String(row[groupColumn]).trim();
    }
    const code = String(row[codeColumn] ?? "").trim();
    const description = String(row[descriptionColumn] ?? "").trim();
    // Skip the sub-header row and any blank/section rows.
    if (!code || !description || normalizeHeader(code) === "codigo") continue;

    const distributorPrice = distributorColumn >= 0 ? numberValue(row[distributorColumn]) : null;
    const hospitalPrice = hospitalColumn >= 0 ? numberValue(row[hospitalColumn]) : null;
    if ((distributorPrice == null || distributorPrice < 0) && (hospitalPrice == null || hospitalPrice < 0)) {
      invalidPrices += 1;
      continue;
    }
    const packSize = packColumn >= 0 ? numberValue(row[packColumn]) : null;
    products.set(code, {
      code,
      description,
      presentation: currentGroup,
      packSize: Math.max(1, Math.trunc(Number(packSize) || 1)),
    });
    // Fall back to the other tier when one price is missing so every product has
    // both, keeping pricing predictable regardless of the selected client type.
    const distributor = distributorPrice != null && distributorPrice >= 0 ? distributorPrice : hospitalPrice;
    const hospital = hospitalPrice != null && hospitalPrice >= 0 ? hospitalPrice : distributorPrice;
    if (distributor != null) distributorPrices[code] = distributor;
    if (hospital != null) hospitalPrices[code] = hospital;
  }
  if (products.size === 0) return null;

  const periodMatch = String(sourceName || "").match(/(0[1-9]|1[0-2])[.\-_]?(20\d{2})/);
  const period = periodMatch ? `${periodMatch[1]}.${periodMatch[2]}` : "Tabela Medicone";
  return {
    name: String(sourceName || period),
    period,
    importedAt: new Date().toISOString(),
    regions: [{ value: "default", label: "Tabela única" }],
    categories: [
      { value: "hospital", label: "Hospital / Clínica" },
      { value: "distribuidor", label: "Distribuidor" },
    ],
    products: Array.from(products.values()),
    prices: { default: { hospital: hospitalPrices, distribuidor: distributorPrices } },
    invalidPrices,
    fallbackPrices: 0,
  };
}

module.exports = { normalizeHeader, field, numberValue, productRows, salesPriceTableFromSheets, mediconeSalesTableFromSheets };
