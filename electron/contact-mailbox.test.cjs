const assert = require("node:assert/strict");
const test = require("node:test");
const { aggregateContacts, MAILBOX_PRESETS } = require("./contact-mailbox.cjs");

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
