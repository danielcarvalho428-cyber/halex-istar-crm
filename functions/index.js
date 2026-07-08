const crypto = require("node:crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const Stripe = require("stripe");
const nodemailer = require("nodemailer");

initializeApp();
const db = getFirestore();
const signingKey = defineSecret("LICENSE_SIGNING_KEY");
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const emailUser = defineSecret("LICENSE_EMAIL_USER");
const emailPassword = defineSecret("LICENSE_EMAIL_PASSWORD");
const region = "southamerica-east1";
const adminUid = process.env.LICENSE_ADMIN_UID;

// Non-secret config (set in functions/.env). Price IDs come from your Stripe
// product; APP_PUBLIC_URL is where the success/cancel pages are hosted.
const APP_URL = process.env.APP_PUBLIC_URL || "https://halex-istar-crm.web.app";
const priceForPlan = (plan) =>
  plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;

function stripeClient() {
  return new Stripe(stripeSecret.value());
}

function newLicenseKey() {
  return `HALEX-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// Best-effort key delivery by email; skipped (not fatal) when creds aren't set,
// so the success page still delivers the key.
async function sendLicenseEmail(toEmail, customerName, licenseKey) {
  const user = emailUser.value();
  const pass = emailPassword.value();
  if (!user || !pass || !toEmail) return false;
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transport.sendMail({
    from: `Halex Istar CRM <${user}>`,
    to: toEmail,
    subject: "Sua licença do Halex Istar CRM",
    text: [
      `Olá${customerName ? ` ${customerName}` : ""},`,
      "",
      "Obrigado pela assinatura do Halex Istar CRM. Sua chave de licença é:",
      "",
      licenseKey,
      "",
      "Abra o aplicativo, cole a chave na tela de ativação e clique em Ativar.",
      "Cada licença permite ativar até 2 computadores.",
      "",
      "Equipe Halex Istar",
    ].join("\n"),
  });
  return true;
}

async function licenseBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const snap = await db
    .collection("licenses")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

function subscriptionPeriodEndMs(subscription) {
  return subscription?.current_period_end
    ? subscription.current_period_end * 1000
    : Date.now();
}

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

// ---------------------------------------------------------------------------
// Stripe subscriptions — a paying customer gets a license automatically. Manual
// comp licenses still go through saveLicense above; both write the same doc.
// ---------------------------------------------------------------------------

// Public: the app's "Assinar" button calls this to get a hosted Checkout URL.
exports.createCheckoutSession = onCall({ region, secrets: [stripeSecret] }, async (request) => {
  const plan = request.data?.plan === "annual" ? "annual" : "monthly";
  const email = text(request.data?.email, 200).toLowerCase();
  const priceId = priceForPlan(plan);
  if (!priceId) throw new HttpsError("failed-precondition", "Plano não configurado no servidor.");
  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email || undefined,
    allow_promotion_codes: true,
    metadata: { plan },
    subscription_data: { metadata: { plan } },
    success_url: `${APP_URL}/license-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/license-cancelled`,
  });
  return { url: session.url };
});

// Public: the success page polls this until the webhook has provisioned the key.
exports.licenseForCheckout = onCall({ region }, async (request) => {
  const sessionId = text(request.data?.sessionId, 200);
  if (!sessionId) throw new HttpsError("invalid-argument", "Sessão inválida.");
  const snap = await db
    .collection("licenses")
    .where("stripeCheckoutSessionId", "==", sessionId)
    .limit(1)
    .get();
  if (snap.empty) return { ready: false };
  const data = snap.docs[0].data();
  return { ready: true, licenseKey: snap.docs[0].id, customerEmail: data.customerEmail || "" };
});

async function provisionFromCheckout(stripe, session) {
  const subscriptionId = session.subscription;
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const email = session.customer_details?.email || session.customer_email || "";
  const customerName = session.customer_details?.name || "";
  const plan = session.metadata?.plan === "annual" ? "annual" : "monthly";
  const expiresAt = subscriptionPeriodEndMs(subscription);

  const existing = await licenseBySubscription(subscriptionId);
  if (existing) {
    await existing.ref.set(
      { status: "active", expiresAt: Timestamp.fromMillis(expiresAt), stripeCheckoutSessionId: session.id, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return existing.id;
  }

  const licenseId = newLicenseKey();
  await db.collection("licenses").doc(licenseId).set({
    customerName: text(customerName),
    customerEmail: text(email, 200).toLowerCase(),
    plan,
    status: "active",
    expiresAt: Timestamp.fromMillis(expiresAt),
    maxDevices: 2,
    graceDays: 7,
    devices: {},
    stripeCustomerId: session.customer || null,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("license_events").add({ type: "stripe_provisioned", licenseKey: licenseId, subscriptionId, createdAt: FieldValue.serverTimestamp() });
  await sendLicenseEmail(email, customerName, licenseId).catch((error) => console.error("License email failed:", error));
  return licenseId;
}

async function extendFromInvoice(stripe, invoice) {
  const doc = await licenseBySubscription(invoice.subscription);
  if (!doc) return; // creation is handled by checkout.session.completed
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  await doc.ref.set(
    { status: "active", expiresAt: Timestamp.fromMillis(subscriptionPeriodEndMs(subscription)), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function setSubscriptionStatus(subscriptionId, status) {
  const doc = await licenseBySubscription(subscriptionId);
  if (!doc) return;
  await doc.ref.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

// Stripe -> here. Verifies the signature over the raw body, then provisions,
// renews, or suspends the matching license.
exports.stripeWebhook = onRequest(
  { region, secrets: [stripeSecret, stripeWebhookSecret, emailUser, emailPassword] },
  async (req, res) => {
    const stripe = stripeClient();
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        stripeWebhookSecret.value(),
      );
    } catch (error) {
      console.error("Stripe signature verification failed:", error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          if (session.mode === "subscription" && session.payment_status === "paid") {
            await provisionFromCheckout(stripe, session);
          }
          break;
        }
        case "invoice.paid":
          await extendFromInvoice(stripe, event.data.object);
          break;
        case "customer.subscription.deleted":
          await setSubscriptionStatus(event.data.object.id, "expired");
          break;
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          if (["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
            await setSubscriptionStatus(subscription.id, "expired");
          } else if (subscription.status === "past_due") {
            await setSubscriptionStatus(subscription.id, "suspended");
          } else if (subscription.status === "active") {
            await setSubscriptionStatus(subscription.id, "active");
          }
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook handler error:", error);
      res.status(500).send("Webhook handler failed");
    }
  },
);
