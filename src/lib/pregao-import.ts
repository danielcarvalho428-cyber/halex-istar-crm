// Reads a distribuidora's pregão spreadsheet (in memory only — never persisted)
// and matches each requested item to one of our catalog products, so a cotação
// can be built from just the products that are ours.
//
// Pregão sheets vary wildly between distribuidoras: column order differs, the
// price/brand columns are blank (they want us to fill them), and the header row
// can be misaligned with the data (e.g. the quantity lands under an "UND"
// header). So we DETECT the description and quantity columns from the content
// rather than trusting header positions, and we match on the medicine's
// substance + concentration + volume + form instead of exact text.

export type ProductLike = {
  id: string;
  code: string;
  description: string;
  presentation?: string;
  brand?: string;
};

export type PregaoRow = {
  // 1-based position of the row in the source sheet (for display/debugging).
  sourceRow: number;
  item: string;
  description: string;
  quantity: number;
  unit: string;
};

export type PregaoParse = {
  sheetName: string;
  descriptionColumn: number;
  quantityColumn: number | null;
  rows: PregaoRow[];
};

export type MatchConfidence = "high" | "medium" | "low" | "none";

export type PregaoMatch = {
  productId: string | null;
  score: number;
  confidence: MatchConfidence;
  // Best alternatives (including the winner) so the review UI can offer a quick
  // pick without re-scoring the whole catalog.
  candidates: Array<{ productId: string; score: number }>;
};

// --- text normalization ----------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeText(value: string): string {
  return stripAccents(String(value ?? ""))
    .toLowerCase()
    .replace(/[_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that carry no discriminating signal in these specs — dropping them
// leaves the actual substance tokens (cloreto, sodio, glicose, manitol, …).
const STOPWORDS = new Set([
  "solucao", "injetavel", "injetaveis", "sistema", "fechado", "aberto",
  "apresentacao", "dosagem", "principio", "ativo", "concentracao", "composicao",
  "forma", "farmaceutica", "caracteristica", "caracteristicas", "adicional",
  "adicionais", "uso", "unidade", "fornecimento", "com", "de", "da", "do",
  "das", "dos", "para", "e", "em", "ao", "a", "o", "as", "os", "endovenosa",
  "intravenosa", "intravenoso", "via", "administracao", "diluicao", "infusao",
  "medicamentos", "gerais", "humano", "indicacao", "aplicacao", "transparente",
  "polipropileno", "bolsas", "bolsa", "frasco", "frascos", "ampola", "ampolas",
  "amp", "fr", "und", "ml", "mg", "meq", "l", "g", "associada", "associado",
  "assoc", "simples", "medicamento", "produto",
]);

// ---------------------------------------------------------------------------
// PRODUCT ALIASES — the same product reaches us under different names depending
// on the distribuidora/manufacturer. Add entries here as you discover them.
//
//   canonical  — a word that appears in OUR product's name/presentation.
//   synonyms   — other single words that mean the same product (brand ↔ generic).
//                Matched in both directions, so it doesn't matter whether the
//                catalog uses the brand or the generic name.
//   requireAll — for products written out as a composition instead of a name:
//                if EVERY word in one of these groups appears in the request,
//                the canonical is credited (e.g. glicose + cloreto + sódio →
//                glicofisiológico). Use lowercase, no accents.
// ---------------------------------------------------------------------------
type AliasGroup = {
  canonical: string;
  synonyms?: string[];
  requireAll?: string[][];
};

const ALIAS_GROUPS: AliasGroup[] = [
  // Our catalog abbreviates "CLOR." for cloreto — normalize it so "CLOR. SODIO"
  // fully matches a request's "CLORETO DE SÓDIO".
  { canonical: "cloreto", synonyms: ["clor"] },
  // Halex brand names ↔ the generic name distribuidoras usually send (verified
  // against the bulas). The product is the brand and there's no separate generic
  // product, so aliasing the generic to it lets a generic-named request find it.
  { canonical: "noprosil", synonyms: ["metoclopramida", "metoclopramido", "plasil", "norposil"] }, // metoclopramida
  { canonical: "ondansetrona", synonyms: ["nausedron", "vonau", "zofran", "modifical"] },
  { canonical: "halexminophen", synonyms: ["paracetamol", "acetaminofeno", "acetaminophen"] }, // paracetamol injetável
  { canonical: "nalbli", synonyms: ["nalbufina", "nalbufino"] }, // nalbufina
  { canonical: "cymevir", synonyms: ["ganciclovir"] },
  { canonical: "axiflennid", synonyms: ["cetoprofeno", "ketoprofeno"] },
  { canonical: "clize", synonyms: ["clonidina"] },
  { canonical: "beca", synonyms: ["metoprolol"] },
  { canonical: "lizbi", synonyms: ["linezolida", "linezolid"] },
  { canonical: "plasmin", synonyms: ["hidroxietilamido", "hidroxietil"] }, // amido hidroxietílico (HES)
  { canonical: "quevatryl", synonyms: ["granisetrona", "granisetron"] }, // cloridrato de granisetrona
  { canonical: "lowe", synonyms: ["adenosina"] },
  // Composed-name products that arrive written as their composition instead of
  // by name. Each requireAll lists tokens unique enough to identify the product.
  {
    // Glicofisiológico = "glicose associada ao cloreto de sódio 5% + 0,9%".
    canonical: "glicofisiologico",
    synonyms: ["glicofisiologica", "glicofisiologia"],
    requireAll: [["glicose", "cloreto", "sodio"], ["glicose", "fisiologico"]],
  },
  {
    // Plasmaistar = solução de eletrólitos com gliconato + acetato de sódio.
    canonical: "plasmaistar",
    requireAll: [["gliconato", "acetato"]],
  },
  {
    // Ringer com lactato escrito como composição (lactato + cálcio + potássio).
    canonical: "ringer",
    requireAll: [["lactato", "calcio", "potassio"]],
  },
];

// term → canonical (both directions collapse to the canonical token).
const TOKEN_SYNONYMS = new Map<string, string>();
for (const group of ALIAS_GROUPS) {
  TOKEN_SYNONYMS.set(group.canonical, group.canonical);
  for (const synonym of group.synonyms ?? []) TOKEN_SYNONYMS.set(synonym, group.canonical);
}
const ALIAS_RULES = ALIAS_GROUPS.filter((group) => group.requireAll?.length).map((group) => ({
  canonical: group.canonical,
  requireAll: group.requireAll!,
}));

// Substance words: alphabetic tokens (>=3 chars) that aren't stopwords, mapped
// through the synonym table so brand and generic names collapse together.
function substanceTokens(normalized: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalized.split(/[^a-z]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    tokens.add(TOKEN_SYNONYMS.get(raw) ?? raw);
  }
  return tokens;
}

// Canonicals credited because all the words of a requireAll group are present —
// how a composed spec ("glicose … cloreto … sódio") resolves to a product name.
function aliasHits(tokens: Set<string>): Set<string> {
  const hits = new Set<string>();
  for (const rule of ALIAS_RULES) {
    if (rule.requireAll.some((group) => group.every((word) => tokens.has(word)))) {
      hits.add(rule.canonical);
    }
  }
  return hits;
}

// Volumes in millilitres — "500ml", "500 ml", "100ML". Litres are converted.
function volumes(normalized: string): Set<number> {
  const found = new Set<number>();
  const mlRegex = /(\d+(?:[.,]\d+)?)\s*ml\b/g;
  let match: RegExpExecArray | null;
  while ((match = mlRegex.exec(normalized))) {
    found.add(Math.round(parseFloat(match[1].replace(",", "."))));
  }
  const lRegex = /(\d+(?:[.,]\d+)?)\s*l\b/g;
  while ((match = lRegex.exec(normalized))) {
    found.add(Math.round(parseFloat(match[1].replace(",", ".")) * 1000));
  }
  return found;
}

// Percentage concentrations — "0,9%", "5 %", "10%". Stored ×10 as integers so
// 0,9 and 0.9 compare cleanly without float noise.
function concentrations(normalized: string): Set<number> {
  const found = new Set<number>();
  const regex = /(\d+(?:[.,]\d+)?)\s*%/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized))) {
    found.add(Math.round(parseFloat(match[1].replace(",", ".")) * 10));
  }
  return found;
}

type Signature = {
  substances: Set<string>;
  volumes: Set<number>;
  concentrations: Set<number>;
  // Canonicals credited via a requireAll rule — tracked so a composed-name match
  // (glicofisiológico) can outweigh a partial one (plain glicose).
  aliases: Set<string>;
};

function signatureOf(text: string): Signature {
  const normalized = normalizeText(text);
  const base = substanceTokens(normalized);
  const aliases = aliasHits(base);
  return {
    substances: new Set([...base, ...aliases]),
    volumes: volumes(normalized),
    concentrations: concentrations(normalized),
    aliases,
  };
}

// The "head" of a pregão spec — the product name before the first comma, dash
// or spec keyword — is where the real drug lives; everything after is boilerplate
// composition/specification text that can mention OTHER substances (e.g. a Ringer
// spec listing "cloreto de sódio"). Matching the head keeps a product from being
// pulled in by a substance that only appears in another product's spec.
function headOf(text: string): string {
  const normalized = normalizeText(text);
  const cut = normalized.search(/,|;| - |:|\(|\bespecificacao\b|\bcomposicao\b|\bprincipio\b|\bdosagem\b|\bconcentracao\b/);
  return cut > 0 ? normalized.slice(0, cut) : normalized;
}

type RequestSignature = Signature & { headSubstances: Set<string> };

function requestSignatureOf(text: string): RequestSignature {
  const full = signatureOf(text);
  return {
    ...full,
    // An alias hit is a strong product identifier wherever it appears, so it
    // counts toward the head even when the composition is in the spec tail.
    headSubstances: new Set([...substanceTokens(headOf(text)), ...full.aliases]),
  };
}

function anyShared<T>(a: Set<T>, b: Set<T>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function sharedCount<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

// --- matching --------------------------------------------------------------

// Scores a pregão description against one product signature. Substance overlap
// is the backbone; volume and concentration are strong discriminators between
// otherwise-identical products (250 ml vs 500 ml, 5% vs 50%), so a mismatch
// there is penalized and a match rewarded.
function scoreSignature(want: RequestSignature, have: Signature): number {
  // The product's name must appear in the item's HEAD, or it isn't the item
  // being requested — this filters out products dragged in by spec boilerplate.
  const headShared = sharedCount(want.headSubstances, have.substances);
  if (headShared === 0) return 0;

  const shared = sharedCount(want.substances, have.substances);
  if (shared === 0) return 0;
  // Fraction of the product's substance words that the request covers, so a
  // short product name fully contained in a long spec scores high.
  const coverage = shared / Math.max(1, have.substances.size);
  let score = shared * 2 + coverage * 3 + headShared;

  if (have.volumes.size && want.volumes.size) {
    score += anyShared(want.volumes, have.volumes) ? 4 : -4;
  }
  // Only let concentration move the score once the product's substance is a full
  // match; otherwise a shared "10%" could rescue the wrong drug (sódio vs potássio).
  const fullSubstanceMatch = shared === have.substances.size;
  if (fullSubstanceMatch && have.concentrations.size && want.concentrations.size) {
    score += anyShared(want.concentrations, have.concentrations) ? 4 : -3;
  }
  // A composed-name alias match (e.g. glicofisiológico) is a decisive signal —
  // enough to win over a product that only matched one of its component words.
  score += sharedCount(want.aliases, have.substances) * 6;
  return score;
}

function confidenceFor(score: number, runnerUp: number): MatchConfidence {
  if (score <= 0) return "none";
  // A clear winner that also cleared a solid absolute bar is trustworthy.
  if (score >= 9 && score - runnerUp >= 2) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export function matchPregaoDescription(
  description: string,
  products: ProductLike[],
): PregaoMatch {
  const want = requestSignatureOf(description);
  if (want.substances.size === 0) {
    return { productId: null, score: 0, confidence: "none", candidates: [] };
  }
  const scored = products
    .map((product) => ({
      productId: product.id,
      score: scoreSignature(
        want,
        signatureOf(`${product.description} ${product.presentation ?? ""}`),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { productId: null, score: 0, confidence: "none", candidates: [] };
  }
  const best = scored[0];
  const runnerUp = scored[1]?.score ?? 0;
  return {
    productId: best.productId,
    score: best.score,
    confidence: confidenceFor(best.score, runnerUp),
    candidates: scored.slice(0, 5),
  };
}

// --- sheet parsing ---------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".").trim();
    return cleaned !== "" && Number.isFinite(Number(cleaned));
  }
  return false;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textLength(value: unknown): number {
  return typeof value === "string" ? value.trim().length : 0;
}

// Finds the header row (the first row mentioning "descrição"), then the
// description column, then the quantity column — detected as the first mostly
// numeric column after the description, which survives header/data misalignment.
export function parsePregaoMatrix(
  matrix: unknown[][],
  sheetName: string,
): PregaoParse | null {
  if (!Array.isArray(matrix) || matrix.length === 0) return null;

  let headerIndex = -1;
  let descriptionColumn = -1;
  for (let r = 0; r < Math.min(matrix.length, 15); r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = normalizeText(String(row[c] ?? ""));
      if (cell === "descricao" || cell.startsWith("descricao")) {
        headerIndex = r;
        descriptionColumn = c;
        break;
      }
    }
    if (headerIndex >= 0) break;
  }

  const dataStart = headerIndex >= 0 ? headerIndex + 1 : 0;
  const dataRows = matrix.slice(dataStart).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""));
  if (dataRows.length === 0) return null;

  const columnCount = Math.max(...dataRows.map((row) => row.length), descriptionColumn + 1);

  // Fallback description column: the column whose cells are longest on average.
  if (descriptionColumn < 0) {
    let bestLen = 0;
    for (let c = 0; c < columnCount; c += 1) {
      const avg = dataRows.reduce((sum, row) => sum + textLength(row[c]), 0) / dataRows.length;
      if (avg > bestLen) {
        bestLen = avg;
        descriptionColumn = c;
      }
    }
  }
  if (descriptionColumn < 0) return null;

  // Quantity column: first column after the description that is mostly positive
  // numbers. (The leading "ITEM" column is before the description, so it's not
  // a candidate — this avoids mistaking the item sequence for the quantity.)
  let quantityColumn: number | null = null;
  for (let c = descriptionColumn + 1; c < columnCount; c += 1) {
    const numeric = dataRows.filter((row) => isFiniteNumber(row[c]) && toNumber(row[c]) > 0).length;
    if (numeric >= Math.ceil(dataRows.length * 0.6)) {
      quantityColumn = c;
      break;
    }
  }

  const rows: PregaoRow[] = [];
  dataRows.forEach((row, index) => {
    const description = String(row[descriptionColumn] ?? "").trim();
    if (!description) return;
    // Item number, if a short leading column looks like one.
    const item = descriptionColumn > 0 ? String(row[0] ?? "").trim() : "";
    const quantity = quantityColumn != null ? toNumber(row[quantityColumn]) : 0;
    // Unit: a short text column between description and quantity, if any.
    let unit = "";
    for (let c = descriptionColumn + 1; c < (quantityColumn ?? columnCount); c += 1) {
      const value = String(row[c] ?? "").trim();
      if (value && !isFiniteNumber(value)) { unit = value; break; }
    }
    rows.push({ sourceRow: dataStart + index + 1, item, description, quantity, unit });
  });

  if (rows.length === 0) return null;
  return { sheetName, descriptionColumn, quantityColumn, rows };
}

// Picks the sheet that parses into the most rows (distribuidoras sometimes leave
// empty helper sheets alongside the real one).
export function parsePregaoWorkbook(
  sheets: Array<{ name: string; matrix: unknown[][] }>,
): PregaoParse | null {
  let best: PregaoParse | null = null;
  for (const sheet of sheets) {
    const parsed = parsePregaoMatrix(sheet.matrix, sheet.name);
    if (parsed && (!best || parsed.rows.length > best.rows.length)) best = parsed;
  }
  return best;
}
