import assert from "node:assert/strict";
import test from "node:test";
import {
  matchContactsToClients,
  nameTokens,
  scoreContact,
  type MailboxContact,
} from "./client-contact-match.ts";
import type { CrmClient } from "./crm-preview.ts";

function client(patch: Partial<CrmClient> & { id: string; name: string }): CrmClient {
  return {
    code: "",
    city: "",
    state: "",
    contact: "",
    phone: "",
    email: "",
    lastPurchase: "",
    averageCycleDays: 0,
    nextPurchase: "",
    total12m: 0,
    status: "Em ciclo",
    ...patch,
  };
}

function contact(patch: Partial<MailboxContact> & { address: string }): MailboxContact {
  return {
    name: "",
    subject: "",
    lastSeenAt: "2026-08-01",
    messages: 1,
    ...patch,
  };
}

test("drops accents and razão social boilerplate from the name tokens", () => {
  assert.deepEqual(nameTokens("HOSPITAL ORTOPÉDICO CERES LTDA"), ["ORTOPEDICO", "CERES"]);
  // Nothing distinctive left means nothing to match on.
  assert.deepEqual(nameTokens("HOSPITAL MUNICIPAL LTDA"), []);
});

test("matches the client by the distinctive words of the display name", () => {
  const suggestions = matchContactsToClients(
    [client({ id: "a", name: "HOSPITAL ORTOPEDICO CERES LTDA" })],
    [
      contact({ address: "compras@ortopedicoceres.com.br", name: "Compras Ortopedico Ceres" }),
      contact({ address: "contato@outrohospital.com.br", name: "Outro Hospital" }),
    ],
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].contact.address, "compras@ortopedicoceres.com.br");
  assert.equal(suggestions[0].confidence, "alta");
  assert.match(suggestions[0].evidence, /nome: ORTOPEDICO, CERES/);
});

test("a shared generic word alone never proposes an address", () => {
  const suggestions = matchContactsToClients(
    [client({ id: "a", name: "HOSPITAL SANTA CLARA" })],
    [contact({ address: "compras@hospitalsaopaulo.com.br", name: "Hospital Sao Paulo" })],
  );
  assert.deepEqual(suggestions, []);
});

test("reads the client name from the subject when the display name is empty", () => {
  const [suggestion] = matchContactsToClients(
    [client({ id: "a", name: "CENTRO ONCOLOGICO DE PALMAS" })],
    [contact({ address: "financeiro@gmail.com", subject: "Pedido — Oncologico Palmas" })],
  );
  assert.equal(suggestion.contact.address, "financeiro@gmail.com");
  assert.match(suggestion.evidence, /nome: ONCOLOGICO, PALMAS/);
});

test("a corporate domain reinforces the match, a personal one does not", () => {
  const corporate = scoreContact(
    client({ id: "a", name: "CLINICA VIDA PLENA" }),
    contact({ address: "rafael@vidaplena.com.br", name: "Rafael" }),
  );
  const personal = scoreContact(
    client({ id: "a", name: "CLINICA VIDA PLENA" }),
    contact({ address: "vidaplena@gmail.com", name: "Rafael" }),
  );
  assert.ok(corporate.score > 0);
  assert.match(corporate.evidence, /domínio: vidaplena.com.br/);
  assert.equal(personal.score, 0);
});

test("only clients without an e-mail get a suggestion", () => {
  const suggestions = matchContactsToClients(
    [
      client({ id: "a", name: "HOSPITAL ORTOPEDICO CERES", email: "ja@temcadastro.com.br" }),
      client({ id: "b", name: "CENTRO ONCOLOGICO DE PALMAS" }),
    ],
    [
      contact({ address: "compras@ortopedicoceres.com.br", name: "Ortopedico Ceres" }),
      contact({ address: "compras@oncologicopalmas.com.br", name: "Oncologico Palmas" }),
    ],
  );
  assert.deepEqual(suggestions.map((item) => item.client.id), ["b"]);
});

test("keeps the strongest address when several mention the same client", () => {
  const [suggestion] = matchContactsToClients(
    [client({ id: "a", name: "HOSPITAL ORTOPEDICO CERES" })],
    [
      contact({ address: "antigo@gmail.com", subject: "Ceres" }),
      contact({ address: "compras@ortopedicoceres.com.br", name: "Ortopedico Ceres", messages: 12 }),
    ],
  );
  assert.equal(suggestion.contact.address, "compras@ortopedicoceres.com.br");
});
