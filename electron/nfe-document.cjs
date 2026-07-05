function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function isValidNfeAccessKey(value) {
  const accessKey = digits(value);
  if (accessKey.length !== 44) return false;
  let weight = 2;
  let sum = 0;
  for (let index = 42; index >= 0; index -= 1) {
    sum += Number(accessKey[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return checkDigit === Number(accessKey[43]);
}

function parseNfePdfIdentity(fileName, text) {
  const fileKey = digits(String(fileName).replace(/\.pdf$/i, ""));
  const textKeys = (String(text).match(/(?:\d[\s.]*){44}/g) || [])
    .map(digits)
    .filter((key) => key.length === 44);
  const accessKey = [fileKey, ...textKeys].find(isValidNfeAccessKey);
  if (!accessKey) {
    const fallback = String(fileName).match(/(?:NF[-_ ]*)?0*(\d{3,12})(?=\.pdf$)/i);
    return {
      identity: fallback ? { invoiceNumber: fallback[1], accessKey: "", customerOrderNumber: "" } : null,
      issues: ["Chave de acesso da NF-e não encontrada; confira o PDF antes do envio."],
    };
  }
  const customerOrder = String(text).match(
    /(?:PEDIDO|ORDEM\s+DE\s+COMPRA)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .\/-]{2,30}?)(?=\s*\||\s*$)/im,
  );
  return {
    identity: {
      accessKey,
      invoiceNumber: accessKey.slice(25, 34).replace(/^0+(?=\d)/, ""),
      customerOrderNumber: customerOrder?.[1]?.trim() || "",
    },
    issues: [],
  };
}

module.exports = { isValidNfeAccessKey, parseNfePdfIdentity };
