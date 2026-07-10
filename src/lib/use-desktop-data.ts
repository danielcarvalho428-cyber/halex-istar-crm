"use client";

import { useEffect, useState } from "react";
import type { CrmClient, CrmProduct } from "./crm-preview";
import { previewClients, previewProducts } from "./crm-preview";
import { localIsoDate } from "./date";

export const CRM_DATA_CHANGED_EVENT = "halex:crm-data-changed";
export function notifyCrmDataChanged() {
  window.dispatchEvent(new CustomEvent(CRM_DATA_CHANGED_EVENT));
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function clientFromRow(row: DesktopClient): CrmClient {
  const next = String(row.next_purchase || "");
  const today = localIsoDate();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  return {
    id: String(row.id),
    code: String(row.code || ""),
    name: String(row.name || ""),
    city: String(row.city || ""),
    state: String(row.state || ""),
    contact: String(row.contact || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    lastPurchase: String(row.last_purchase || ""),
    averageCycleDays: Number(row.average_cycle_days || 0),
    nextPurchase: next,
    total12m: Number(row.total_12m || 0),
    status:
      next && next <= today
        ? "Comprar agora"
        : next && next <= localIsoDate(soon)
          ? "Contato próximo"
          : "Em ciclo",
    clientType:
      row.client_type === "hospital" || row.client_type === "distribuidor"
        ? row.client_type
        : undefined,
    cnpj: row.cnpj || row.document || undefined,
    carteira: row.carteira || undefined,
  };
}

function productFromRow(row: DesktopProduct): CrmProduct {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    description: String(row.description || ""),
    presentation: String(row.presentation || ""),
    brand: String(row.brand || "Halex Istar"),
    unit: String(row.unit || "UN"),
    price: Number(row.price || 0),
    priceHospital: Number(row.price_hospital || row.price || 0),
    priceDistribuidor: Number(row.price_distribuidor || row.price || 0),
    packSize: Math.max(1, Number(row.pack_size || 1)),
  };
}

export function useDesktopClients() {
  const [clients, setClients] = useState<CrmClient[]>([]);

  useEffect(() => {
    const load = () => {
      const manualClients = readJsonArray<CrmClient>("manualClients");

      if (window.halexDesktop?.clients) {
        window.halexDesktop.clients.list().then((rows) => {
          setClients([...manualClients, ...rows.map(clientFromRow)]);
        }).catch(() => setClients([...manualClients, ...previewClients]));
      } else queueMicrotask(() => setClients([...manualClients, ...previewClients]));
    };
    load();
    window.addEventListener(CRM_DATA_CHANGED_EVENT, load);
    return () => window.removeEventListener(CRM_DATA_CHANGED_EVENT, load);
  }, []);

  return clients;
}

export function useDesktopProducts() {
  const [products, setProducts] = useState<CrmProduct[]>([]);
  useEffect(() => {
    if (window.halexDesktop?.products) {
      window.halexDesktop.products
        .list()
        .then((rows) => setProducts(rows.map(productFromRow)))
        .catch(() => setProducts([]));
    } else queueMicrotask(() => setProducts(previewProducts));
  }, []);
  return products;
}

export function useDesktopQuotations() {
  const [quotations, setQuotations] = useState<DesktopQuotation[]>([]);
  useEffect(() => {
    const load = () => {
      const manualQuotations = readJsonArray<DesktopQuotation>("manualQuotations");

      if (window.halexDesktop?.quotations) {
        window.halexDesktop.quotations.list().then((rows) => setQuotations([...manualQuotations, ...rows])).catch(() => setQuotations(manualQuotations));
      } else queueMicrotask(() => setQuotations(manualQuotations));
    };
    load();
    window.addEventListener(CRM_DATA_CHANGED_EVENT, load);
    return () => window.removeEventListener(CRM_DATA_CHANGED_EVENT, load);
  }, []);
  return quotations;
}

export function useDesktopLetterhead() {
  const [letterhead, setLetterhead] = useState<{
    fileName: string;
    mime: string;
    dataUrl: string | null;
  } | null>(null);
  useEffect(() => {
    window.halexDesktop?.settings
      .getLetterhead()
      .then(setLetterhead)
      .catch(() => {});
  }, []);
  return letterhead;
}

export function useDesktopAgreements() {
  const [agreements, setAgreements] = useState<DesktopAgreementGroup[]>([]);
  useEffect(() => {
    window.halexDesktop?.agreements
      .list()
      .then(setAgreements)
      .catch(() => {});
  }, []);
  return agreements;
}

export function useDesktopSalesPriceTable() {
  const [table, setTable] = useState<DesktopSalesPriceTable | null>(null);
  useEffect(() => {
    window.halexDesktop?.imports
      .activeSalesPriceTable()
      .then(setTable)
      .catch(() => {});
  }, []);
  return table;
}
