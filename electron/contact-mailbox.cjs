// Read-only IMAP harvest used to fill in the e-mail of clients that were
// imported without one. It never opens message bodies: only the envelope
// (from/to/cc, subject, date) is fetched, which is what the name matching in
// src/lib/client-contact-match.ts needs.

const MAILBOX_PRESETS = {
  yahoo: { label: "Yahoo", host: "imap.mail.yahoo.com", port: 993 },
  gmail: { label: "Gmail", host: "imap.gmail.com", port: 993 },
  outlook: { label: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
};

// Mailboxes that answer nobody: harvesting them only creates noise.
const IGNORED_ADDRESS = /(^|[.@_-])(no-?reply|nao-?responda|notifica|mailer-daemon|postmaster|bounce)/i;

function addressesOf(envelope) {
  return [
    ...(envelope.from || []),
    ...(envelope.to || []),
    ...(envelope.cc || []),
  ];
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

async function scanMailbox({ host, port, user, pass, folders, months = 24, maxMessages = 8000 }) {
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const since = new Date(Date.now() - Math.max(1, months) * 30 * 24 * 60 * 60 * 1000);
  const envelopes = [];
  const scannedFolders = [];

  await client.connect();
  try {
    const wanted = folders && folders.length
      ? folders
      : ["INBOX", ...(await client.list())
        .filter((box) => box.specialUse === "\\Sent")
        .map((box) => box.path)];

    for (const folder of wanted) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder);
      } catch {
        continue; // A folder that does not exist on this account is skipped.
      }
      scannedFolders.push(folder);
      try {
        for await (const message of client.fetch({ since }, { envelope: true })) {
          if (message.envelope) envelopes.push(message.envelope);
          if (envelopes.length >= maxMessages) break;
        }
      } finally {
        lock.release();
      }
      if (envelopes.length >= maxMessages) break;
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return {
    contacts: aggregateContacts(envelopes, user),
    messages: envelopes.length,
    folders: scannedFolders,
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

module.exports = { MAILBOX_PRESETS, aggregateContacts, mergeContacts, scanMailbox };
