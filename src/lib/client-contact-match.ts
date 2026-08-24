import type { CrmClient } from "./crm-preview";

export type MailboxContact = {
  address: string;
  /** Display name on the envelope, e.g. "Compras — Hospital Santa Clara". */
  name: string;
  /** Subject of the message the address came from, used as extra evidence. */
  subject: string;
  /** ISO date of the most recent message with this address. */
  lastSeenAt: string;
  /** How many messages carried this address. */
  messages: number;
};

export type ContactSuggestion = {
  client: CrmClient;
  contact: MailboxContact;
  score: number;
  confidence: "alta" | "media" | "baixa";
  /** Why this address was proposed, shown on the review screen. */
  evidence: string;
};

/**
 * Razão social boilerplate: these words repeat across most clients, so they
 * must never be what makes two names look alike.
 */
const GENERIC_NAME_TOKENS = new Set([
  "LTDA", "ME", "EPP", "EIRELI", "SA", "S", "A", "CIA", "COMERCIO", "COMERCIAL",
  "DE", "DA", "DO", "DAS", "DOS", "E", "EM", "HOSPITAL", "CLINICA", "CENTRO",
  "MEDICO", "MEDICA", "SAUDE", "INSTITUTO", "ASSOCIACAO", "FUNDACAO", "MUNICIPAL",
  "MUNICIPIO", "PREFEITURA", "ESTADO", "SECRETARIA", "SERVICOS", "DISTRIBUIDORA",
  "FARMACIA", "GRUPO", "UNIDADE", "SANTA", "SAO", "NOSSA", "SENHORA",
]);

const PERSONAL_MAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.com.br", "hotmail.com", "outlook.com",
  "live.com", "bol.com.br", "uol.com.br", "terra.com.br", "icloud.com",
]);

export function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export function nameTokens(value?: string | null) {
  return normalizeText(value)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
}

function emailDomain(address: string) {
  return address.split("@")[1]?.toLowerCase() || "";
}

/**
 * The corporate part of the domain, letters only: "compras@vidaplena.com.br"
 * becomes "VIDAPLENA". Personal mailboxes carry no company identity at all.
 */
function domainIdentity(address: string) {
  const domain = emailDomain(address);
  if (!domain || PERSONAL_MAIL_DOMAINS.has(domain)) return "";
  return domain
    .replace(/\.(com|net|org|gov|edu|med|br|inf)(\.|$)/g, "$2")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

/**
 * Scores one contact against one client. Identity has to come from the address
 * itself — the display name or a corporate domain. The subject only says who
 * the message talks *about*: a representante writing about a hospital is not
 * the hospital's contact, which is exactly how wrong addresses got proposed.
 */
export function scoreContact(client: CrmClient, contact: MailboxContact) {
  const clientTokens = nameTokens(client.name);
  if (clientTokens.length === 0) return { score: 0, evidence: "" };

  const fromName = new Set(nameTokens(contact.name));
  const fromSubject = new Set(nameTokens(contact.subject));
  const matchedName = clientTokens.filter((token) => fromName.has(token));
  const matchedSubject = clientTokens.filter((token) => fromSubject.has(token));
  // The domain glues the words together, so match tokens inside it and only
  // trust it when it covers most of the razão social.
  const domain = domainIdentity(contact.address);
  const inDomain = domain ? clientTokens.filter((token) => domain.includes(token)) : [];
  const matchedDomain = inDomain.length * 2 >= clientTokens.length ? inDomain : [];

  const evidence: string[] = [];
  let score = 0;

  if (matchedName.length > 0) {
    // Every distinctive token matching is a strong signal; a single one out of
    // many is weak, so the ratio drives most of the score.
    const nameRatio = matchedName.length / clientTokens.length;
    score += Math.round(nameRatio * 70) + matchedName.length * 5;
    evidence.push(`nome: ${matchedName.join(", ")}`);
  }
  if (matchedDomain.length > 0) {
    score += 40;
    evidence.push(`domínio: ${emailDomain(contact.address)}`);
  }
  // The subject only reinforces an identity the address already carries; on its
  // own it stays below MIN_CONTACT_SCORE and is never proposed.
  if (matchedSubject.length > 0) {
    score += score > 0 ? 10 : Math.min(20, matchedSubject.length * 8);
    evidence.push(`assunto: ${matchedSubject.join(", ")}`);
  }
  // Repeated correspondence with the same address adds a little confidence.
  if (score > 0 && contact.messages > 1) score += Math.min(10, contact.messages);

  return { score, evidence: evidence.join(" · ") };
}

function confidenceOf(score: number): ContactSuggestion["confidence"] {
  if (score >= 80) return "alta";
  if (score >= 45) return "media";
  return "baixa";
}

/** The lowest score worth showing on the review screen. */
export const MIN_CONTACT_SCORE = 30;

/**
 * Domains that are never a client contact: our own people and the parceiros who
 * write about many clients. The mailbox's own domain is added at call time.
 */
export const DEFAULT_INTERNAL_DOMAINS = ["medicone.com.br", "halexistar.com.br", "halex.com.br"];

/**
 * An address that fits three or more different clients belongs to someone who
 * talks about clients — a representante, a colega — not to a client.
 */
export const MAX_CLIENTS_PER_ADDRESS = 2;

export type MatchOptions = {
  /** Extra domains to ignore, beyond DEFAULT_INTERNAL_DOMAINS. */
  internalDomains?: string[];
};

export type MatchResult = {
  suggestions: ContactSuggestion[];
  /** Addresses held back, with the reason, so the screen can explain itself. */
  discarded: Array<{ address: string; reason: string; clients: number }>;
};

function isInternal(address: string, internalDomains: Set<string>) {
  const domain = emailDomain(address);
  return domain !== "" && internalDomains.has(domain);
}

/**
 * Proposes one address per client that still has no e-mail. Nothing here writes
 * to the cadastro — the screen always asks for confirmation first.
 */
export function matchContactsToClients(
  clients: CrmClient[],
  contacts: MailboxContact[],
  options: MatchOptions = {},
): ContactSuggestion[] {
  return matchContacts(clients, contacts, options).suggestions;
}

export function matchContacts(
  clients: CrmClient[],
  contacts: MailboxContact[],
  options: MatchOptions = {},
): MatchResult {
  const internalDomains = new Set(
    [...DEFAULT_INTERNAL_DOMAINS, ...(options.internalDomains || [])]
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  );
  const usable = contacts.filter((contact) => !isInternal(contact.address, internalDomains));
  const discarded: MatchResult["discarded"] = contacts
    .filter((contact) => isInternal(contact.address, internalDomains))
    .map((contact) => ({ address: contact.address, reason: "domínio interno", clients: 0 }));

  const pending = clients.filter((client) => !client.email?.trim());
  const best = pending
    .map((client) => {
      let winner: ContactSuggestion | null = null;
      for (const contact of usable) {
        const { score, evidence } = scoreContact(client, contact);
        if (score < MIN_CONTACT_SCORE) continue;
        if (winner && score <= winner.score) continue;
        winner = { client, contact, score, confidence: confidenceOf(score), evidence };
      }
      return winner;
    })
    .filter((suggestion): suggestion is ContactSuggestion => suggestion !== null);

  // One address proposed for many clients is a person who writes about them.
  const clientsPerAddress = new Map<string, number>();
  for (const suggestion of best) {
    const address = suggestion.contact.address;
    clientsPerAddress.set(address, (clientsPerAddress.get(address) || 0) + 1);
  }
  for (const [address, count] of clientsPerAddress) {
    if (count > MAX_CLIENTS_PER_ADDRESS) {
      discarded.push({ address, reason: "aparece em vários clientes", clients: count });
    }
  }

  const suggestions = best
    .filter((suggestion) => (clientsPerAddress.get(suggestion.contact.address) || 0) <= MAX_CLIENTS_PER_ADDRESS)
    .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name));

  return { suggestions, discarded };
}
