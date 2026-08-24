import assert from "node:assert/strict";
import test from "node:test";
import {
  matchContacts,
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

test("the subject alone never proposes an address", () => {
  // A representante writing "Pedido — Oncologico Palmas" is talking about the
  // client, not writing from it: her address must not become their contact.
  const suggestions = matchContactsToClients(
    [client({ id: "a", name: "CENTRO ONCOLOGICO DE PALMAS" })],
    [contact({ address: "vendedora@parceira.com.br", subject: "Pedido — Oncologico Palmas" })],
  );
  assert.deepEqual(suggestions, []);
});

test("the subject still reinforces an address that already carries the name", () => {
  const [suggestion] = matchContactsToClients(
    [client({ id: "a", name: "CENTRO ONCOLOGICO DE PALMAS" })],
    [contact({ address: "compras@oncologicopalmas.com.br", name: "Oncologico Palmas", subject: "Pedido — Oncologico Palmas" })],
  );
  assert.equal(suggestion.confidence, "alta");
  assert.match(suggestion.evidence, /assunto: ONCOLOGICO, PALMAS/);
});

test("ignores addresses from our own and partner domains", () => {
  const result = matchContacts(
    [client({ id: "a", name: "HOSPITAL ORTOPEDICO CERES" })],
    [contact({ address: "vendedora@medicone.com.br", name: "Ana — Ortopedico Ceres" })],
  );
  assert.deepEqual(result.suggestions, []);
  assert.deepEqual(result.discarded.map((item) => item.reason), ["domínio interno"]);
});

test("drops an address that fits many clients at once", () => {
  const shared = contact({ address: "ana@parceiracomercial.com.br", name: "Ana Ceres Palmas Vida" });
  const result = matchContacts(
    [
      client({ id: "a", name: "HOSPITAL ORTOPEDICO CERES" }),
      client({ id: "b", name: "CENTRO ONCOLOGICO DE PALMAS" }),
      client({ id: "c", name: "CLINICA VIDA PLENA" }),
    ],
    [shared],
  );
  assert.deepEqual(result.suggestions, []);
  const reason = result.discarded.find((item) => item.address === shared.address);
  assert.equal(reason?.reason, "aparece em vários clientes");
  assert.equal(reason?.clients, 3);
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
