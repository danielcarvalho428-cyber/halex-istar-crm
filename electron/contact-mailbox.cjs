// Read-only IMAP harvest used to fill in the e-mail of clients that were
// imported without one. It never opens message bodies: only the envelope
// (from/sender/reply-to/to/cc/bcc, subject, date) is fetched, which is what the
// name matching in src/lib/client-contact-match.ts needs.

const MAILBOX_PRESETS = {
  yahoo: { label: "Yahoo", host: "imap.mail.yahoo.com", port: 993 },
  gmail: { label: "Gmail", host: "imap.gmail.com", port: 993 },
  outlook: { label: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
};

// Mailboxes that answer nobody: harvesting them only creates noise.
const IGNORED_ADDRESS = /(^|[.@_-])(no-?reply|nao-?responda|notifica|mailer-daemon|postmaster|bounce)/i;

function addressesOf(envelope) {
  // sender/replyTo carregam o endereço real de quem responde quando o From
  // é uma caixa de sistema, e o bcc aparece na cópia que ficou em Enviados.
  return [
    ...(envelope.from || []),
    ...(envelope.sender || []),
    ...(envelope.replyTo || []),
    ...(envelope.to || []),
    ...(envelope.cc || []),
    ...(envelope.bcc || []),
  ];
}

// Pastas sem contato de cliente: lixo, rascunho e spam só geram ruído.
const SKIPPED_SPECIAL_USE = new Set(["trash", "junk", "drafts"]);
// Rótulos virtuais do Gmail que repetem mensagens já lidas em outra pasta.
const SKIPPED_PATH = /^\[Gmail\]\/(Importante|Important|Com estrela|Starred)$/i;

/** O \Sent, \All etc. chegam com uma barra invertida que atrapalha a comparação. */
function specialUseOf(box) {
  return String(box?.specialUse || "").replace(/\\/g, "").trim().toLowerCase();
}

function isSelectable(box) {
  const flags = box?.flags ? [...box.flags] : [];
  return Boolean(box?.path) && !flags.some((flag) => /noselect/i.test(String(flag)));
}

/**
 * Pastas a varrer. O Gmail tira da INBOX tudo que foi arquivado, então a pasta
 * "Todos os e-mails" (\All) é a única que contém a caixa inteira; onde ela não
 * existe (Yahoo, Outlook) varremos todas as pastas selecionáveis, porque o
 * contato do cliente costuma estar numa pasta arquivada e não na INBOX.
 */
function foldersToScan(list) {
  const keep = (list || []).filter((box) => isSelectable(box)
    && !SKIPPED_SPECIAL_USE.has(specialUseOf(box))
    && !SKIPPED_PATH.test(box.path));

  const all = keep.find((box) => specialUseOf(box) === "all");
  // \All já contém INBOX, Enviados e arquivadas; as demais só repetiriam.
  if (all) return [all.path];

  const isInbox = (box) => box.path.toUpperCase() === "INBOX";
  const isSent = (box) => specialUseOf(box) === "sent";
  const ordered = [
    ...keep.filter(isInbox),
    ...keep.filter((box) => !isInbox(box) && isSent(box)),
    ...keep.filter((box) => !isInbox(box) && !isSent(box)),
  ];
  return [...new Set(ordered.map((box) => box.path))];
}

/**
 * Folds the envelopes into one entry per address, keeping the most recent
 * subject and display name — those are the evidence shown for the match.
 */
function aggregateContacts(envelopes, ownAddress = "") {
  const own = String(ownAddress || "").trim().toLowerCase();
  const byAddress = new Map();

  for (const envelope of envelopes) {
    const seenAt = envelope.date ? new Date(envelope.date).toISOString() : "";
    const subject = String(envelope.subject || "").slice(0, 200);

    for (const party of addressesOf(envelope)) {
      const address = String(party?.address || "").trim().toLowerCase();
      if (!address || address === own) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) continue;
      if (IGNORED_ADDRESS.test(address)) continue;

      const current = byAddress.get(address);
      const isNewer = !current || (seenAt && seenAt > current.lastSeenAt);
      byAddress.set(address, {
        address,
        name: (isNewer && String(party?.name || "").trim()) || current?.name || "",
        subject: isNewer ? subject : current?.subject || "",
        lastSeenAt: isNewer ? seenAt : current?.lastSeenAt || "",
        messages: (current?.messages || 0) + 1,
      });
    }
  }

  return [...byAddress.values()].sort(
    (a, b) => b.messages - a.messages || a.address.localeCompare(b.address),
  );
}

async function scanMailbox({ host, port, user, pass, folders, months = 24, maxMessages = 40000, maxPerFolder = 20000 }) {
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const since = new Date();
  since.setMonth(since.getMonth() - Math.max(1, Math.round(months)));
  const envelopes = [];
  const seenMessages = new Set();
  const scannedFolders = [];
  const skippedFolders = [];

  await client.connect();
  try {
    const wanted = folders && folders.length
      ? folders
      : foldersToScan(await client.list());

    for (const folder of wanted) {
      if (envelopes.length >= maxMessages) break;
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        continue; // Uma pasta que não existe nesta conta é ignorada.
      }
      try {
        // A busca devolve os UIDs em ordem crescente: ficamos com a fatia mais
        // recente, porque cortar a leitura no meio perderia justamente os
        // e-mails novos, que são os que interessam.
        const uids = await client.search({ since }, { uid: true });
        const budget = Math.min(maxPerFolder, maxMessages - envelopes.length);
        const wantedUids = uids.length > budget ? uids.slice(-budget) : uids;
        if (uids.length > wantedUids.length) {
          skippedFolders.push({ folder, skipped: uids.length - wantedUids.length });
        }
        if (wantedUids.length > 0) {
          for await (const message of client.fetch(wantedUids, { envelope: true }, { uid: true })) {
            if (!message.envelope) continue;
            // A mesma mensagem aparece na INBOX e em Enviados quando o cliente
            // está em cópia; o Message-ID a conta uma vez só.
            const id = message.envelope.messageId || `${folder}:${message.uid}`;
            if (seenMessages.has(id)) continue;
            seenMessages.add(id);
            envelopes.push(message.envelope);
          }
        }
        scannedFolders.push(folder);
      } catch {
        // Uma pasta que recusou a busca não pode derrubar a varredura inteira.
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return {
    contacts: aggregateContacts(envelopes, user),
    messages: envelopes.length,
    folders: scannedFolders,
    skippedFolders,
    since: since.toISOString().slice(0, 10),
  };
}

/**
 * Folds the result of several caixas into one list. The same address seen in
 * two caixas is one contact, with the messages added up and the newest name
 * and subject kept.
 */
function mergeContacts(lists) {
  const byAddress = new Map();

  for (const contact of lists.flat()) {
    const current = byAddress.get(contact.address);
    if (!current) {
      byAddress.set(contact.address, { ...contact });
      continue;
    }
    const isNewer = contact.lastSeenAt > current.lastSeenAt;
    byAddress.set(contact.address, {
      address: contact.address,
      name: (isNewer && contact.name) || current.name || contact.name,
      subject: isNewer ? contact.subject || current.subject : current.subject,
      lastSeenAt: isNewer ? contact.lastSeenAt : current.lastSeenAt,
      messages: current.messages + contact.messages,
    });
  }

  return [...byAddress.values()].sort(
    (a, b) => b.messages - a.messages || a.address.localeCompare(b.address),
  );
}

module.exports = { MAILBOX_PRESETS, aggregateContacts, foldersToScan, mergeContacts, scanMailbox };
