const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const signingKey = defineSecret("LICENSE_SIGNING_KEY");
const region = "southamerica-east1";
const adminUid = process.env.LICENSE_ADMIN_UID;

function requireAdmin(request) {
  if (!request.auth || request.auth.uid !== adminUid) {
    throw new HttpsError("permission-denied", "Administrador não autorizado.");
  }
}

function text(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeKey(value) {
  return text(value, 80).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function validDevice(value) {
  const deviceId = text(value, 100);
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(deviceId)) throw new HttpsError("invalid-argument", "Dispositivo inválido.");
  return deviceId;
}

function token(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(encoded), signingKey.value()).toString("base64url");
  return `${encoded}.${signature}`;
}

function licensePayload(id, data, deviceId) {
  const expiresAt = data.expiresAt?.toMillis?.() || 0;
  const graceDays = Number(data.graceDays || 7);
  const now = Date.now();
  const active = data.status === "active" && expiresAt > now;
  return {
    licenseKey: id,
    customerName: text(data.customerName),
    plan: data.plan === "annual" ? "annual" : "monthly",
    deviceId,
    status: active ? "active" : data.status || "expired",
    expiresAt,
    graceUntil: expiresAt + graceDays * 86400000,
    maxDevices: Number(data.maxDevices || 2),
    issuedAt: now,
    // This signed value is the offline trust boundary. The client must never
    // rely on an editable localStorage timestamp to extend this window.
    validUntil: Math.min(expiresAt, now + 7 * 24 * 60 * 60 * 1000),
  };
}

exports.activateLicense = onCall({ region, secrets: [signingKey], enforceAppCheck: false }, async (request) => {
  const licenseKey = normalizeKey(request.data?.licenseKey);
  const deviceId = validDevice(request.data?.deviceId);
  const deviceName = text(request.data?.deviceName, 100) || "Windows PC";
  if (!licenseKey) throw new HttpsError("invalid-argument", "Chave inválida.");
  const ref = db.collection("licenses").doc(licenseKey);
  const payload = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Chave não encontrada.");
    const data = snapshot.data();
    if (data.status !== "active") throw new HttpsError("permission-denied", "Licença suspensa ou inativa.");
    if (!data.expiresAt || data.expiresAt.toMillis() <= Date.now()) throw new HttpsError("permission-denied", "Licença expirada.");
    const devices = data.devices || {};
    if (!devices[deviceId] && Object.keys(devices).length >= Number(data.maxDevices || 2)) {
      throw new HttpsError("resource-exhausted", "Limite de dois computadores atingido.");
    }
    transaction.update(ref, {
      [`devices.${deviceId}`]: { name: deviceName, activatedAt: Timestamp.now(), lastSeenAt: Timestamp.now() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return licensePayload(licenseKey, data, deviceId);
  });
  await db.collection("license_events").add({ type: "activated", licenseKey, deviceId, createdAt: FieldValue.serverTimestamp() });
  return { token: token(payload), license: payload };
});

exports.validateLicense = onCall({ region, secrets: [signingKey], enforceAppCheck: false }, async (request) => {
  const licenseKey = normalizeKey(request.data?.licenseKey);
  const deviceId = validDevice(request.data?.deviceId);
  const deviceName = text(request.data?.deviceName, 100) || "Windows PC";
  const ref = db.collection("licenses").doc(licenseKey);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Licença não encontrada.");
  const data = snapshot.data();
  if (!data.devices?.[deviceId]) throw new HttpsError("permission-denied", "Computador não ativado.");
  await ref.update({
    [`devices.${deviceId}.name`]: deviceName,
    [`devices.${deviceId}.lastSeenAt`]: Timestamp.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const payload = licensePayload(licenseKey, data, deviceId);
  return { token: token(payload), license: payload };
});

exports.releaseDevice = onCall({ region, secrets: [signingKey], enforceAppCheck: false }, async (request) => {
  const licenseKey = normalizeKey(request.data?.licenseKey);
  const deviceId = validDevice(request.data?.deviceId);
  const ref = db.collection("licenses").doc(licenseKey);
  await ref.update({ [`devices.${deviceId}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("license_events").add({ type: "released", licenseKey, deviceId, createdAt: FieldValue.serverTimestamp() });
  return { released: true };
});

exports.listLicenses = onCall({ region }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection("licenses").orderBy("createdAt", "desc").limit(500).get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      customerName: data.customerName || "",
      customerEmail: data.customerEmail || "",
      plan: data.plan || "monthly",
      status: data.status || "active",
      expiresAt: data.expiresAt?.toMillis?.() || 0,
      maxDevices: Number(data.maxDevices || 2),
      graceDays: Number(data.graceDays || 7),
      devices: Object.entries(data.devices || {}).map(([id, device]) => ({ id, ...device, activatedAt: device.activatedAt?.toMillis?.() || 0, lastSeenAt: device.lastSeenAt?.toMillis?.() || 0 })),
    };
  });
});

exports.saveLicense = onCall({ region }, async (request) => {
  requireAdmin(request);
  const input = request.data || {};
  const id = normalizeKey(input.id) || `HALEX-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const expiresAt = Number(input.expiresAt);
  if (!text(input.customerName) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HttpsError("invalid-argument", "Cliente e vencimento futuro são obrigatórios.");
  }
  const ref = db.collection("licenses").doc(id);
  const existing = await ref.get();
  await ref.set({
    customerName: text(input.customerName),
    customerEmail: text(input.customerEmail, 200).toLowerCase(),
    plan: input.plan === "annual" ? "annual" : "monthly",
    status: ["active", "suspended", "expired"].includes(input.status) ? input.status : "active",
    expiresAt: Timestamp.fromMillis(expiresAt),
    maxDevices: 2,
    graceDays: 7,
    devices: existing.exists ? existing.data().devices || {} : {},
    createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id };
});

exports.setLicenseStatus = onCall({ region }, async (request) => {
  requireAdmin(request);
  const id = normalizeKey(request.data?.id);
  const status = request.data?.status;
  if (!id || !["active", "suspended", "expired"].includes(status)) throw new HttpsError("invalid-argument", "Status inválido.");
  await db.collection("licenses").doc(id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  return { updated: true };
});

exports.removeLicenseDevice = onCall({ region }, async (request) => {
  requireAdmin(request);
  const id = normalizeKey(request.data?.id);
  const deviceId = validDevice(request.data?.deviceId);
  await db.collection("licenses").doc(id).update({ [`devices.${deviceId}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  return { removed: true };
});
