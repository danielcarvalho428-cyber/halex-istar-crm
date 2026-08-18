const { normalizeHeader, field, numberValue } = require("./product-import.cjs");

/** Known sales carteiras (equipes). Anything else is kept as free text. */
const KNOWN_CARTEIRAS = ["4104", "4413", "4648"];

function plainText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Public bodies (secretarias, fundos municipais, prefeituras) buy through
 * licitação, so they get their own category instead of being filed as
 * hospitais. Abbreviations used in the ERP export are covered too.
 */
function isPublicBody(name) {
  const text = plainText(name);
  return /\b(SECRETARIA|SEC\.?\s*(EST|MUN)|SES\b|SMS\b|FUNDO|FUND\.?\s*MUN|FMS\b|PREFEITURA|PREF\.?\s*MUNIC|MUNICIPIO|CONSORCIO\s+INTERMUNICIPAL|GOVERNO\s+DO\s+ESTADO)/.test(
    text,
  );
}

function isDistributor(name) {
  const text = plainText(name);
  return /\b(DISTRIBUIDOR|DISTRIBUIDORA|DISTR\.?\s*DE|ATACADIST|ATACADAO)/.test(text);
}

/**
 * Resolves the client category from an explicit column when the sheet has one,
 * otherwise infers it from the razão social. Hospital is the fallback because
 * the carteira is overwhelmingly hospitais/clínicas; the cadastro screen lets
 * the user fix any mismatch afterwards.
 */
function classifyClientType(name, rawType) {
  const explicit = normalizeHeader(rawType || "");
  if (explicit) {
    if (explicit.includes("orgao") || explicit.includes("publico") || explicit.includes("licitacao"))
      return "orgao_publico";
    if (explicit.includes("distrib")) return "distribuidor";
    if (explicit.includes("hospital") || explicit.includes("clinica")) return "hospital";
    if (explicit.includes("particular")) return "particular";
  }
  if (isPublicBody(name)) return "orgao_publico";
  if (isDistributor(name)) return "distribuidor";
  return "hospital";
}

/** Digits-only CNPJ/CPF, zero-padded — Excel drops the leading zeros. */
function documentValue(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return "";
  if (digits.length > 11 && digits.length < 14) return digits.padStart(14, "0");
  if (digits.length < 11) return digits.padStart(11, "0");
  return digits;
}

function carteiraValue(value, sheetName) {
  const text = String(value ?? "").trim();
  if (text) return text;
  const sheet = String(sheetName || "").trim();
  return KNOWN_CARTEIRAS.includes(sheet) ? sheet : "";
}

function clientRow(row, sheetName) {
  const name = String(
    field(row, ["cliente", "nome", "razaosocial", "nomecliente"]) || "",
  ).trim();
  return {
    code: String(
      field(row, ["codigo", "codigocliente", "codcliente", "coderpcliente"]) || "",
    ).trim(),
    name,
    document: documentValue(field(row, ["cnpj", "cpf", "documento"])),
    city: String(field(row, ["cidade", "municipio"]) || "").trim(),
    state: String(field(row, ["uf", "estado"]) || "")
      .trim()
      .slice(0, 2)
      .toUpperCase(),
    contact: String(field(row, ["contato", "nomecontato"]) || "").trim(),
    phone: String(field(row, ["telefone", "celular", "whatsapp", "fone"]) || "").trim(),
    email: String(field(row, ["email", "emailcliente"]) || "").trim(),
    address: String(field(row, ["endereco", "logradouro"]) || "").trim(),
    average_cycle_days: numberValue(field(row, ["ciclomedio", "ciclodias", "mediaciclo"])),
    total_12m: numberValue(field(row, ["total12m", "compras12meses", "valor12m"])) || 0,
    notes: String(field(row, ["observacoes", "notas"]) || "").trim(),
    carteira: carteiraValue(
      field(row, ["carteira", "grupo", "equipe", "regional", "regiao"]),
      sheetName,
    ),
    client_type: classifyClientType(
      name,
      field(row, ["tipocliente", "tipo", "categoria"]),
    ),
  };
}

/**
 * Builds client rows from `[{ name, rows }]` sheets so the sheet name can act
 * as the carteira when the sheet itself has no CARTEIRA column.
 */
function clientRowsFromSheets(sheets, dateValue) {
  return sheets.flatMap((sheet) =>
    sheet.rows.map((row) => ({
      ...clientRow(row, sheet.name),
      last_purchase: dateValue(field(row, ["ultimacompra", "dataultimacompra"])),
      next_purchase: dateValue(field(row, ["proximacompra", "previsaocompra"])),
    })),
  );
}

module.exports = {
  KNOWN_CARTEIRAS,
  classifyClientType,
  documentValue,
  carteiraValue,
  clientRowsFromSheets,
};
