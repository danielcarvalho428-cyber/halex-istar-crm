const assert = require("node:assert/strict");
const test = require("node:test");
const { aggregateContacts, foldersToScan, MAILBOX_PRESETS, mergeContacts } = require("./contact-mailbox.cjs");

test("keeps one entry per address with the newest name and subject", () => {
  const contacts = aggregateContacts(
    [
      {
        date: "2026-01-10T10:00:00Z",
        subject: "Cotação antiga",
        from: [{ address: "Compras@OrtopedicoCeres.com.br", name: "Compras" }],
        to: [{ address: "vendas@halex.com.br", name: "Halex" }],
      },
      {
        date: "2026-08-01T10:00:00Z",
        subject: "Pedido 12345",
        from: [{ address: "compras@ortopedicoceres.com.br", name: "Maria — Ortopedico Ceres" }],
        cc: [],
      },
    ],
    "vendas@halex.com.br",
  );

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].address, "compras@ortopedicoceres.com.br");
  assert.equal(contacts[0].name, "Maria — Ortopedico Ceres");
  assert.equal(contacts[0].subject, "Pedido 12345");
  assert.equal(contacts[0].messages, 2);
});

test("drops the own address, robots and malformed addresses", () => {
  const contacts = aggregateContacts(
    [
      {
        date: "2026-08-01T10:00:00Z",
        subject: "Aviso",
        from: [{ address: "no-reply@banco.com.br" }],
        to: [
          { address: "vendas@halex.com.br" },
          { address: "endereco-invalido" },
          { address: "mailer-daemon@yahoo.com" },
          { address: "compras@hospital.com.br" },
        ],
      },
    ],
    "vendas@halex.com.br",
  );

  assert.deepEqual(contacts.map((item) => item.address), ["compras@hospital.com.br"]);
});

test("orders by how often the address appears", () => {
  const contacts = aggregateContacts([
    { date: "2026-08-01T10:00:00Z", from: [{ address: "raro@a.com.br" }] },
    { date: "2026-08-02T10:00:00Z", from: [{ address: "frequente@b.com.br" }] },
    { date: "2026-08-03T10:00:00Z", from: [{ address: "frequente@b.com.br" }] },
  ]);
  assert.deepEqual(contacts.map((item) => item.address), ["frequente@b.com.br", "raro@a.com.br"]);
});

test("carries the IMAP host of every supported provider", () => {
  assert.equal(MAILBOX_PRESETS.yahoo.host, "imap.mail.yahoo.com");
  assert.equal(MAILBOX_PRESETS.gmail.host, "imap.gmail.com");
  assert.ok(MAILBOX_PRESETS.outlook.port === 993);
});

test("merges the same address seen in two caixas", () => {
  const merged = mergeContacts([
    [{ address: "compras@hospital.com.br", name: "Compras", subject: "Cotação", lastSeenAt: "2026-01-10T00:00:00.000Z", messages: 3 }],
    [{ address: "compras@hospital.com.br", name: "Maria — Compras", subject: "Pedido 900", lastSeenAt: "2026-08-01T00:00:00.000Z", messages: 5 }],
    [{ address: "outro@hospital.com.br", name: "", subject: "", lastSeenAt: "2026-02-01T00:00:00.000Z", messages: 1 }],
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].address, "compras@hospital.com.br");
  assert.equal(merged[0].messages, 8);
  assert.equal(merged[0].name, "Maria — Compras");
  assert.equal(merged[0].subject, "Pedido 900");
});

function box(path, specialUse = "", flags = []) {
  return { path, specialUse, flags: new Set(flags) };
}

test("no Gmail varre \"Todos os e-mails\", que \u00e9 a \u00fanica pasta com o arquivado", () => {
  const folders = foldersToScan([
    box("INBOX"),
    box("[Gmail]/Todos os e-mails", "\\All"),
    box("[Gmail]/E-mails enviados", "\\Sent"),
    box("[Gmail]/Lixeira", "\\Trash"),
    box("[Gmail]/Spam", "\\Junk"),
    box("[Gmail]", "", ["\\Noselect"]),
  ]);

  assert.deepEqual(folders, ["[Gmail]/Todos os e-mails"]);
});

test("sem a pasta \"todos\", varre INBOX, enviados e as pastas arquivadas", () => {
  const folders = foldersToScan([
    box("Arquivo"),
    box("Clientes/Licita\u00e7\u00f5es"),
    box("INBOX"),
    box("Enviados", "\\Sent"),
    box("Bulk Mail", "\\Junk"),
    box("Rascunhos", "\\Drafts"),
    box("Lixo", "\\Trash"),
  ]);

  assert.deepEqual(folders, ["INBOX", "Enviados", "Arquivo", "Clientes/Licita\u00e7\u00f5es"]);
});

test("colhe tamb\u00e9m o reply-to e o bcc do envelope", () => {
  const contacts = aggregateContacts([
    {
      date: "2026-03-01T10:00:00Z",
      subject: "Pedido 900",
      from: [{ address: "portal@sistema.com.br", name: "Portal" }],
      replyTo: [{ address: "compras@hospital.com.br", name: "Compras" }],
      bcc: [{ address: "financeiro@hospital.com.br", name: "Financeiro" }],
    },
  ], "vendas@halex.com.br");

  const addresses = contacts.map((item) => item.address);
  assert.ok(addresses.includes("compras@hospital.com.br"));
  assert.ok(addresses.includes("financeiro@hospital.com.br"));
});
