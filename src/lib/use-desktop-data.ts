"use client";

import { useEffect, useState } from "react";
import type { CrmClient, CrmProduct } from "./crm-preview";
import { previewClients, previewProducts } from "./crm-preview";

function clientFromRow(row: DesktopClient): CrmClient {
  const next = String(row.next_purchase || "");
  const today = new Date().toISOString().slice(0, 10);
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
        : next && next <= soon.toISOString().slice(0, 10)
          ? "Contato próximo"
          : "Em ciclo",
  };
}

function productFromRow(row: DesktopProduct): CrmProduct {
  return {
    id: String(row.id),
    code: String(row.code || ""),
    description: String(row.description || ""),
    presentation: String(row.presentation || ""),
    unit: String(row.unit || "UN"),
    price: Number(row.price || 0),
  };
}

export function useDesktopClients() {
  const [clients, setClients] = useState(previewClients);
  useEffect(() => {
    window.halexDesktop?.clients
      .list()
      .then((rows) => setClients(rows.map(clientFromRow)))
      .catch(() => {});
  }, []);
  return clients;
}

export function useDesktopProducts() {
  const [products, setProducts] = useState(previewProducts);
  useEffect(() => {
    window.halexDesktop?.products
      .list()
      .then((rows) => setProducts(rows.map(productFromRow)))
      .catch(() => {});
  }, []);
  return products;
}

export function useDesktopQuotations() {
  const [quotations, setQuotations] = useState<DesktopQuotation[]>([]);
  useEffect(() => {
    window.halexDesktop?.quotations
      .list()
      .then(setQuotations)
      .catch(() => {});
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
