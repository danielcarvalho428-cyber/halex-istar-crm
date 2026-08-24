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
 * Scores one contact against one client. The distinctive tokens of the razão
 * social are what count — a shared "HOSPITAL" proves nothing.
 */
export function scoreContact(client: CrmClient, contact: MailboxContact) {
  const clientTokens = nameTokens(client.name);
  if (clientTokens.length === 0) return { score: 0, evidence: "" };

  const haystack = new Set([
    ...nameTokens(contact.name),
    ...nameTokens(contact.subject),
  ]);
  const matchedName = clientTokens.filter((token) => haystack.has(token));
  // The domain glues the words together, so match tokens inside it and only
  // trust it when it covers most of the razão social.
  const domain = domainIdentity(contact.address);
  const inDomain = domain ? clientTokens.filter((token) => domain.includes(token)) : [];
  const matchedDomain = inDomain.length * 2 >= clientTokens.length ? inDomain : [];

  const nameRatio = matchedName.length / clientTokens.length;
  const evidence: string[] = [];
  let score = 0;

  if (matchedName.length > 0) {
    // Every distinctive token matching is a strong signal; a single one out of
    // many is weak, so the ratio drives most of the score.
    score += Math.round(nameRatio * 70) + matchedName.length * 5;
    evidence.push(`nome: ${matchedName.join(", ")}`);
  }
  if (matchedDomain.length > 0) {
    score += 30;
    evidence.push(`domínio: ${emailDomain(contact.address)}`);
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
 * Proposes one address per client that still has no e-mail. Nothing here writes
 * to the cadastro — the screen always asks for confirmation first.
 */
export function matchContactsToClients(
  clients: CrmClient[],
  contacts: MailboxContact[],
): ContactSuggestion[] {
  const pending = clients.filter((client) => !client.email?.trim());

  return pending
    .map((client) => {
      let best: ContactSuggestion | null = null;
      for (const contact of contacts) {
        const { score, evidence } = scoreContact(client, contact);
        if (score < MIN_CONTACT_SCORE) continue;
        if (best && score <= best.score) continue;
        best = { client, contact, score, confidence: confidenceOf(score), evidence };
      }
      return best;
    })
    .filter((suggestion): suggestion is ContactSuggestion => suggestion !== null)
    .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name));
}
