import assert from "node:assert/strict";
import test from "node:test";
import {
  contactsFromLicitacoes,
  federalUpdates,
  type FederalRecord,
} from "./client-contact-sources.ts";
import type { CrmClient } from "./crm-preview.ts";
import type { Licitacao } from "../types/index.ts";

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

function licitacao(patch: Partial<Licitacao> & { id: string }): Licitacao {
  return {
    ano: 2026,
    orgao: "Órgão",
    numero_pregao: "10/2026",
    numero_processo: null,
    modalidade: null,
    data_abertura: "2026-03-01",
    status: "ganho",
    valor_total_ganho: 0,
    observacoes: null,
    created_at: "2026-03-01",
    updated_at: "2026-03-01",
    ...patch,
  } as Licitacao;
}

test("copies the órgão contact to the client that has no e-mail", () => {
  const contacts = contactsFromLicitacoes(
    [client({ id: "a", name: "HOSPITAL MUNICIPAL", code: "500024" })],
    [licitacao({
      id: "l1",
      codigo_cliente: "500024",
      orgao_email: "Compras@Hospital.GOV.br",
      orgao_telefone: "6332361300",
      orgao_contato: "Ana",
    })],
  );

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].email, "compras@hospital.gov.br");
  assert.equal(contacts[0].phone, "6332361300");
  assert.equal(contacts[0].source, "Pregão 10/2026/2026");
});

test("ignores clients that already have an e-mail and invalid addresses", () => {
  const contacts = contactsFromLicitacoes(
    [
      client({ id: "a", name: "COM EMAIL", code: "1", email: "ja@tem.com.br" }),
      client({ id: "b", name: "EMAIL QUEBRADO", code: "2" }),
    ],
    [
      licitacao({ id: "l1", codigo_cliente: "1", orgao_email: "outro@orgao.gov.br" }),
      licitacao({ id: "l2", codigo_cliente: "2", orgao_email: "sem arroba" }),
    ],
  );
  assert.deepEqual(contacts, []);
});

test("keeps the contact of the most recent licitação", () => {
  const [contact] = contactsFromLicitacoes(
    [client({ id: "a", name: "HOSPITAL", code: "00500024" })],
    [
      licitacao({ id: "old", codigo_cliente: "500024", data_abertura: "2024-01-10", orgao_email: "antigo@orgao.gov.br" }),
      licitacao({ id: "new", codigo_cliente: "500024", data_abertura: "2026-05-10", orgao_email: "atual@orgao.gov.br" }),
    ],
  );
  assert.equal(contact.email, "atual@orgao.gov.br");
});

const record: FederalRecord = {
  cnpj: "06134926000156",
  razaoSocial: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA",
  phone: "6332361300",
  city: "PALMAS",
  state: "TO",
  situacao: "ATIVA",
};

test("fills only the telefone that is missing", () => {
  const [update] = federalUpdates(
    [client({ id: "a", name: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA", cnpj: "06.134.926/0001-56", city: "PALMAS" })],
    [record],
  );
  assert.equal(update.phone, "6332361300");
  assert.deepEqual(update.notes, []);

  const withPhone = federalUpdates(
    [client({ id: "a", name: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA", cnpj: "06134926000156", city: "PALMAS", phone: "(63) 3236-1300" })],
    [record],
  );
  assert.deepEqual(withPhone, []);
});

test("flags a CNPJ the Receita no longer considers active", () => {
  const [update] = federalUpdates(
    [client({ id: "a", name: "COP - CENTRO ONCOLOGICO DE PALMAS LTDA", cnpj: "06134926000156", city: "PALMAS", phone: "6332361300" })],
    [{ ...record, situacao: "BAIXADA" }],
  );
  assert.equal(update.inactive, true);
  assert.deepEqual(update.notes, ["Receita: baixada"]);
});

test("reports divergent cidade and razão social without changing them", () => {
  const [update] = federalUpdates(
    [client({ id: "a", name: "CENTRO ONCOLOGICO", cnpj: "06134926000156", city: "GOIANIA", phone: "6332361300" })],
    [record],
  );
  assert.equal(update.phone, "");
  assert.deepEqual(update.notes, [
    "cidade divergente: PALMAS",
    "razão social: COP - CENTRO ONCOLOGICO DE PALMAS LTDA",
  ]);
});
