"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, FilePlus2, Phone, ShoppingBag, TrendingDown } from "lucide-react";
import { appDate, money } from "@/lib/crm-preview";
import { localIsoDate } from "@/lib/date";
import { clientIdentityLabel } from "@/lib/client-duplicates";
import { isCnpjBaixado, receitaLabel } from "@/lib/client-contact-sources";
import { SALES_SEGMENTS, segmentFor } from "@/lib/sales-history";
import { useDesktopClients } from "@/lib/use-desktop-data";

type Purchase = Awaited<ReturnType<NonNullable<typeof window.halexDesktop>["clients"]["purchases"]>>[number];

function ClientHistory() {
  const clientId = useSearchParams().get("id") || "";
  const clients = useDesktopClients();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  const client = clients.find((item) => item.id === clientId);

  useEffect(() => {
    const desktop = window.halexDesktop?.clients;
    // Fora do desktop não há histórico para buscar: a espera termina no
    // microtask seguinte, sem setState direto no corpo do efeito.
    if (!clientId || !desktop?.purchases) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    desktop
      .purchases(clientId)
      .then(setPurchases)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const stats = useMemo(() => {
    const dates = [...new Set(purchases.map((item) => item.purchased_at))].sort();
    const total = purchases.reduce((sum, item) => sum + Number(item.total_value || 0), 0);
    const today = localIsoDate();
    const last = dates[dates.length - 1] || "";
    const daysSinceLast = last
      ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000)
      : 0;
    const yearAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
    const averageInterval = dates.length > 1
      ? Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${dates[0]}T12:00:00Z`)) / 86_400_000 / (dates.length - 1))
      : 0;

    // Um pedido pode gerar várias notas: o que conta como compra é a data.
    const byYear = new Map<string, { total: number; orders: Set<string> }>();
    for (const purchase of purchases) {
      const year = purchase.purchased_at.slice(0, 4);
      const current = byYear.get(year) || { total: 0, orders: new Set<string>() };
      current.total += Number(purchase.total_value || 0);
      current.orders.add(purchase.purchased_at);
      byYear.set(year, current);
    }

    return {
      orders: dates.length,
      notes: purchases.length,
      total,
      total12m: purchases
        .filter((item) => item.purchased_at >= yearAgo)
        .reduce((sum, item) => sum + Number(item.total_value || 0), 0),
      first: dates[0] || "",
      last,
      daysSinceLast,
      averageInterval,
      overdue: averageInterval > 0 && daysSinceLast > averageInterval * 1.5,
      segment: last ? segmentFor(daysSinceLast) : "sem_compra",
      byYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [purchases]);

  if (!client) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/clientes" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
          <ArrowLeft size={14} />
          Voltar para a carteira
        </Link>
        <p className="glass-card p-6 text-sm text-stone-500">
          {loading ? "Carregando..." : "Cliente não encontrado."}
        </p>
      </div>
    );
  }

  const identity = clientIdentityLabel(client);
  const segmentLabel = SALES_SEGMENTS.find((item) => item.value === stats.segment)?.label
    || "Sem compra registrada";
  const maxYear = Math.max(1, ...stats.byYear.map(([, value]) => value.total));

  return (
    <div className="space-y-5 pb-16">
      <header className="page-hero">
        <p className="lumina-kicker">CRM</p>
        <h1 className="mt-2">{client.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{identity.code}</span>
          <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{identity.cnpj}</span>
          {client.carteira && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">Carteira {client.carteira}</span>}
          {isCnpjBaixado(client) && <span className="rounded-full bg-red-100 px-2 py-1 uppercase text-red-800">{receitaLabel(client)}</span>}
          {client.reactivationDecision && (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Reconquistar: {client.reactivationDecision}</span>
          )}
        </div>
        <p className="mt-2 text-sm text-stone-500">
          {client.city}/{client.state}
          {client.contact ? ` · ${client.contact}` : ""}
          {client.phone ? ` · ${client.phone}` : ""}
          {client.email ? ` · ${client.email}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/clientes" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
          <ArrowLeft size={14} />
          Voltar para a carteira
        </Link>
        {client.phone && (
          <a href={`tel:${client.phone.replace(/\D/g, "")}`} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
            <Phone size={14} />
            Ligar
          </a>
        )}
        <Link href={`/dashboard/cotacoes/nova?cliente=${client.id}`} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
          <FilePlus2 size={14} />
          Criar cotação
        </Link>
      </div>

      {purchases.length === 0 ? (
        <p className="glass-card p-6 text-sm text-stone-500">
          {loading
            ? "Carregando o histórico..."
            : "Nenhuma compra registrada. Importe o relatório de vendas na tela de Reativação para preencher o histórico."}
        </p>
      ) : (
        <>
          <section className="metric-strip grid grid-cols-2 md:grid-cols-4">
            {[
              ["Último pedido", `${appDate(stats.last)} (${stats.daysSinceLast}d)`],
              ["Pedidos no período", String(stats.orders)],
              ["Total comprado", money(stats.total)],
              ["Últimos 12 meses", money(stats.total12m)],
            ].map(([label, value]) => (
              <div key={label} className="metric-item p-4">
                <p className="text-[10px] font-bold uppercase text-stone-500">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </section>

          <section className="glass-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-700">{segmentLabel}</span>
              {stats.averageInterval > 0 && (
                <span className="text-xs text-stone-500">Compra a cada {stats.averageInterval} dias em média</span>
              )}
              {stats.overdue && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                  <TrendingDown size={12} />
                  Fora do ciclo
                </span>
              )}
              <span className="ml-auto text-xs text-stone-500">
                Primeiro pedido em {appDate(stats.first)} · {stats.notes} nota(s) fiscal(is)
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {stats.byYear.map(([year, value]) => (
                <div key={year} className="flex items-center gap-3 text-xs">
                  <span className="w-10 font-bold text-stone-600">{year}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
                    <span className="block h-full rounded bg-amber-600" style={{ width: `${Math.max(2, (value.total / maxYear) * 100)}%` }} />
                  </span>
                  <span className="w-32 text-right font-semibold">{money(value.total)}</span>
                  <span className="w-20 text-right text-stone-500">{value.orders.size} pedido(s)</span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-stone-200 p-4">
              <ShoppingBag size={16} className="text-amber-700" />
              <h2 className="font-semibold">Compras registradas</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="grid gap-2 p-3 text-xs sm:grid-cols-[130px_1fr_140px]">
                  <span className="font-semibold">{appDate(purchase.purchased_at)}</span>
                  <span className="text-stone-500">{purchase.document_number ? `NF ${purchase.document_number}` : "—"}</span>
                  <span className="font-bold sm:text-right">{money(Number(purchase.total_value || 0))}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function ClientHistoryPage() {
  return (
    <Suspense fallback={<p className="glass-card p-6 text-sm text-stone-500">Carregando...</p>}>
      <ClientHistory />
    </Suspense>
  );
}
