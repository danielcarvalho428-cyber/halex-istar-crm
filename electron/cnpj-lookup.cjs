// Consulta pública de CNPJ na base aberta da Receita Federal.
//
// The public dataset no longer carries the e-mail of the empresa (it was
// removed for privacy), so this fills the telefone and reports the situação
// cadastral. Every request goes through the main process: the renderer has no
// network access to third parties under the app's CSP.

const PROVIDER_URL = "https://minhareceita.org/";

function normalizeCnpj(value) {
  return String(value ?? "").replace(/\D/g, "").padStart(14, "0");
}

function isValidCnpj(value) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (length) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight - 1 < 2 ? 9 : weight - 1;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13]);
}

/** Keeps only what the cadastro can actually use. */
function parseCompany(payload) {
  const phone = String(payload?.ddd_telefone_1 || "").replace(/\D/g, "");
  return {
    cnpj: normalizeCnpj(payload?.cnpj),
    razaoSocial: String(payload?.razao_social || "").trim(),
    phone: phone.length >= 10 ? phone : "",
    city: String(payload?.municipio || "").trim(),
    state: String(payload?.uf || "").trim(),
    situacao: String(payload?.descricao_situacao_cadastral || "").trim(),
  };
}

/**
 * Looks the CNPJs up a few at a time. The service is free and public, so the
 * concurrency stays low on purpose and anything already known is skipped.
 */
async function lookupCnpjs(cnpjs, { cache = {}, concurrency = 4, fetchImpl = fetch, limit = 400 } = {}) {
  const pending = [];
  const records = [];
  const invalid = [];

  for (const value of cnpjs) {
    const cnpj = normalizeCnpj(value);
    if (!isValidCnpj(cnpj)) {
      invalid.push(cnpj);
      continue;
    }
    if (cache[cnpj]) records.push(cache[cnpj]);
    else if (!pending.includes(cnpj)) pending.push(cnpj);
  }

  const queue = pending.slice(0, limit);
  const failed = [];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const cnpj = queue[cursor];
      cursor += 1;
      try {
        const response = await fetchImpl(`${PROVIDER_URL}${cnpj}`);
        if (!response.ok) {
          failed.push(cnpj);
          continue;
        }
        const record = parseCompany(await response.json());
        records.push(record);
        cache[cnpj] = record;
      } catch {
        failed.push(cnpj);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return {
    records,
    cache,
    consulted: queue.length,
    skipped: Math.max(0, pending.length - queue.length),
    invalid,
    failed,
  };
}

module.exports = { PROVIDER_URL, isValidCnpj, lookupCnpjs, normalizeCnpj, parseCompany };
