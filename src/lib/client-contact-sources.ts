import type { Licitacao } from "@/types";
import type { CrmClient } from "./crm-preview";
import { normalizeCnpj } from "./client-duplicates.ts";

export type LicitacaoContact = {
  client: CrmClient;
  email: string;
  phone: string;
  contact: string;
  /** Which licitação the contact came from, shown on the review screen. */
  source: string;
};

function clientCodeKey(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function validEmail(value?: string | null) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

/**
 * The órgão contact typed on a licitação is the e-mail the equipe already uses
 * to talk to that client — it just never reached the cadastro. Public bodies
 * are exactly where the mailbox scan performs worst, so this is the best
 * source available for them.
 */
export function contactsFromLicitacoes(
  clients: CrmClient[],
  licitacoes: Licitacao[],
): LicitacaoContact[] {
  const byCode = new Map<string, CrmClient>();
  for (const client of clients) {
    const code = clientCodeKey(client.code);
    if (code && !byCode.has(code)) byCode.set(code, client);
  }

  const found = new Map<string, LicitacaoContact>();
  // Newest licitações first, so the most recent contact wins.
  const ordered = [...licitacoes].sort((a, b) =>
    (b.data_abertura || b.created_at || "").localeCompare(a.data_abertura || a.created_at || ""));

  for (const licitacao of ordered) {
    const email = validEmail(licitacao.orgao_email);
    if (!email) continue;
    const client = byCode.get(clientCodeKey(licitacao.codigo_cliente));
    if (!client || client.email?.trim() || found.has(client.id)) continue;

    found.set(client.id, {
      client,
      email,
      phone: String(licitacao.orgao_telefone || "").trim(),
      contact: String(licitacao.orgao_contato || "").trim(),
      source: `Pregão ${licitacao.numero_pregao}${licitacao.ano ? `/${licitacao.ano}` : ""}`,
    });
  }

  return [...found.values()].sort((a, b) => a.client.name.localeCompare(b.client.name));
}

export type FederalRecord = {
  cnpj: string;
  razaoSocial: string;
  phone: string;
  city: string;
  state: string;
  /** "ATIVA", "BAIXADA", "INAPTA"… straight from the Receita. */
  situacao: string;
};

export type FederalUpdate = {
  client: CrmClient;
  record: FederalRecord;
  /** Only the fields worth writing: empty ones on the cadastro. */
  phone: string;
  /** True when the Receita says the CNPJ is no longer active. */
  inactive: boolean;
  /** Divergences worth a look, never written automatically. */
  notes: string[];
};

function digitsOnly(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Turns the Receita records into the changes worth applying. The public data
 * no longer carries e-mail, so this fills the telefone and flags cadastros the
 * Receita considers inactive.
 */
export function federalUpdates(
  clients: CrmClient[],
  records: FederalRecord[],
): FederalUpdate[] {
  const byCnpj = new Map(records.map((record) => [normalizeCnpj(record.cnpj), record]));

  return clients
    .map((client): FederalUpdate | null => {
      const record = byCnpj.get(normalizeCnpj(client.cnpj));
      if (!record) return null;

      const phone = digitsOnly(client.phone) ? "" : record.phone;
      const inactive = record.situacao !== "" && record.situacao.toUpperCase() !== "ATIVA";
      const notes: string[] = [];
      if (inactive) notes.push(`Receita: ${record.situacao.toLowerCase()}`);
      if (record.city && client.city && normalizeText(record.city) !== normalizeText(client.city)) {
        notes.push(`cidade divergente: ${record.city}`);
      }
      if (record.razaoSocial && normalizeText(record.razaoSocial) !== normalizeText(client.name)) {
        notes.push(`razão social: ${record.razaoSocial}`);
      }
      if (!phone && notes.length === 0) return null;

      return { client, record, phone, inactive, notes };
    })
    .filter((update): update is FederalUpdate => update !== null)
    .sort((a, b) => Number(b.inactive) - Number(a.inactive) || a.client.name.localeCompare(b.client.name));
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}
