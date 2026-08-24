import type { CrmClient } from "./crm-preview";

export type DuplicateClientGroup = {
  /** CNPJ with digits only — the identity two cadastros share. */
  document: string;
  /** The cadastro to keep: the one with real history behind it. */
  keeper: CrmClient;
  /** Cadastros quarantined for deletion. */
  duplicates: CrmClient[];
};

export function normalizeCnpj(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCnpj(value?: string | null) {
  const digits = normalizeCnpj(value);
  if (digits.length !== 14) return digits || "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** A CNPJ only identifies a cadastro when it is complete. */
export function hasUsableCnpj(client: CrmClient) {
  return normalizeCnpj(client.cnpj).length === 14;
}

/**
 * Keeps the cadastro with the strongest history: more purchases in 12 months,
 * then the most recent purchase, then the lowest código — so the choice is
 * stable across reloads and re-imports.
 */
function keeperFirst(a: CrmClient, b: CrmClient) {
  return (b.total12m || 0) - (a.total12m || 0)
    || (b.lastPurchase || "").localeCompare(a.lastPurchase || "")
    || (a.code || "").localeCompare(b.code || "")
    || a.id.localeCompare(b.id);
}

export function findDuplicateClientGroups(clients: CrmClient[]): DuplicateClientGroup[] {
  const byDocument = new Map<string, CrmClient[]>();
  for (const client of clients) {
    if (!hasUsableCnpj(client)) continue;
    const document = normalizeCnpj(client.cnpj);
    byDocument.set(document, [...(byDocument.get(document) || []), client]);
  }

  return [...byDocument.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([document, group]) => {
      const sorted = [...group].sort(keeperFirst);
      return { document, keeper: sorted[0], duplicates: sorted.slice(1) };
    })
    .sort((a, b) => b.duplicates.length - a.duplicates.length
      || a.keeper.name.localeCompare(b.keeper.name));
}

/** Ids held back from the carteira until the user decides what to delete. */
export function quarantinedClientIds(clients: CrmClient[]) {
  return new Set(
    findDuplicateClientGroups(clients).flatMap((group) =>
      group.duplicates.map((client) => client.id)),
  );
}

export function clientIdentityLabel(client: CrmClient) {
  const cnpj = formatCnpj(client.cnpj);
  return {
    code: client.code ? `Código ${client.code}` : "Código não informado",
    cnpj: cnpj ? `CNPJ ${cnpj}` : "CNPJ não informado",
    hasCnpj: cnpj !== "",
  };
}
