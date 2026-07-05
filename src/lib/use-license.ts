"use client";

import { useEffect, useState } from "react";
import { LICENSE_PUBLIC_KEY } from "./license-public-key";

const STORAGE_KEY = "halex_app_license_v2";
const DEVICE_KEY = "halex_device_id";
const FUNCTIONS_URL = "https://southamerica-east1-halex-istar-crm.cloudfunctions.net";
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

class LicenseRejectedError extends Error {}

type ServerLicense = {
  licenseKey: string;
  customerName: string;
  plan: "monthly" | "annual";
  deviceId: string;
  status: string;
  expiresAt: number;
  graceUntil: number;
  validUntil: number;
};

type StoredLicense = {
  token: string;
  license: ServerLicense;
  lastChecked: number;
};

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function deviceName() {
  return window.halexDesktop ? "Aplicativo Electron (Windows)" : "Navegador web";
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

let publicKeyPromise: Promise<CryptoKey> | null = null;
function licensePublicKey() {
  if (!publicKeyPromise) {
    const der = base64UrlToBytes(
      LICENSE_PUBLIC_KEY.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""),
    );
    publicKeyPromise = crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
  }
  return publicKeyPromise;
}

// Verifies the Ed25519 token the Cloud Function signed and returns its payload,
// or null if the signature is missing/invalid. This is what makes a stored
// license trustworthy offline — a hand-written localStorage object has no valid
// signature and is rejected here.
async function verifyLicenseToken(token: string): Promise<ServerLicense | null> {
  try {
    const [encoded, signature] = String(token).split(".");
    if (!encoded || !signature) return null;
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      await licensePublicKey(),
      base64UrlToBytes(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as ServerLicense;
  } catch {
    return null;
  }
}

function structurallyActive(license: ServerLicense, lastChecked: number) {
  const now = Date.now();
  return license.status === "active" && license.expiresAt > now && now - lastChecked <= OFFLINE_GRACE_MS;
}

// Offline reuse must clear the signature check; the fresh online response is
// trusted over TLS and uses structurallyActive directly.
async function usableOffline(stored: StoredLicense) {
  const payload = await verifyLicenseToken(stored.token);
  if (!payload || payload.deviceId !== deviceId()) return false;
  return structurallyActive(payload, stored.lastChecked);
}

async function callLicenseFunction(name: "activateLicense" | "validateLicense", data: Record<string, unknown>) {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => null) as {
    result?: { token: string; license: ServerLicense };
    error?: { status?: string; message?: string };
  } | null;
  if (!response.ok || body?.error || !body?.result) {
    throw new LicenseRejectedError(body?.error?.message || "Licença recusada pelo servidor.");
  }
  return body.result;
}

function save(result: { token: string; license: ServerLicense }) {
  const stored: StoredLicense = { ...result, lastChecked: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export function useLicense() {
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function verify() {
      if (process.env.NEXT_PUBLIC_SKIP_LICENSE_CHECK === "1") {
        setIsValid(true);
        setIsChecking(false);
        return;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setIsChecking(false); return; }
      let stored: StoredLicense;
      try {
        stored = JSON.parse(raw) as StoredLicense;
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setIsChecking(false);
        return;
      }
      try {
        // Always revalidate against the server when reachable so renewals and
        // revocations take effect immediately; only fall back to the cached
        // license (signature-verified, within the offline grace window) when
        // the network fails.
        const result = await callLicenseFunction("validateLicense", {
          licenseKey: stored.license.licenseKey,
          deviceId: deviceId(),
          deviceName: deviceName(),
        });
        const updated = save(result);
        setIsValid(structurallyActive(updated.license, updated.lastChecked));
      } catch (cause) {
        if (cause instanceof LicenseRejectedError) {
          localStorage.removeItem(STORAGE_KEY);
          setIsValid(false);
        } else {
          setIsValid(await usableOffline(stored));
        }
      } finally { setIsChecking(false); }
    }
    void verify();
  }, []);

  const activate = async (key: string) => {
    setIsChecking(true);
    setError("");
    try {
      const result = await callLicenseFunction("activateLicense", {
        licenseKey: key.trim().toUpperCase(),
        deviceId: deviceId(),
        deviceName: deviceName(),
      });
      const stored = save(result);
      const valid = structurallyActive(stored.license, stored.lastChecked);
      setIsValid(valid);
      return valid;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ativar esta licença.");
      setIsValid(false);
      return false;
    } finally { setIsChecking(false); }
  };

  const deactivate = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsValid(false);
  };

  return { isValid, isChecking, error, activate, deactivate };
}
