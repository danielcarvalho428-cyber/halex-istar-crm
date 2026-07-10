"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FilePlus2, Search, UserRoundCheck, MapPin, UserCircle2, Pencil, Trash2 } from "lucide-react";
import { appDate, money } from "@/lib/crm-preview";
import { useDesktopClients } from "@/lib/use-desktop-data";

export default function ClientsPage() {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const allClients = useDesktopClients();
  const clients = useMemo(
    () =>
      allClients.filter((client) =>
        `${client.name} ${client.code} ${client.city} ${client.contact}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [allClients, query],
  );
  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">CRM</p>
        <h1 className="mt-2">Clientes</h1>
        <p className="mt-2 text-sm text-stone-500">
          Histórico, ciclo de compra, contato e potencial em uma única carteira.
        </p>
      </header>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="glass-panel relative p-4">
        <Search
          className="absolute left-7 top-1/2 -translate-y-1/2 text-stone-400"
          size={16}
        />
        <input
          className="form-input input-with-icon w-full"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar cliente, código, cidade ou contato"
        />
      </div>
          <Link href="/dashboard/clientes/novo" className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold mb-4">
            <FilePlus2 size={14} />
            Adicionar cliente
          </Link>

      <section className="grid gap-4 xl:grid-cols-2">
        {clients.map((client) => (
          <article key={client.id} className="glass-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserRoundCheck size={17} className="text-amber-700" />
                  <h2 className="font-semibold">{client.name}</h2>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-100 pt-4 text-xs">
                  {client.carteira && (
                    <p className="flex items-center gap-1 font-semibold text-amber-700">
                      <MapPin size={13} />
                      {client.carteira}
                    </p>
                  )}
                  <p className="flex items-center gap-1 text-stone-500">
                    <MapPin size={13} />
                    {client.city}/{client.state}
                  </p>
                  <p className="flex items-center gap-1 text-stone-500">
                    <UserCircle2 size={13} />
                    {client.contact}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                {client.status}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-stone-100 py-4 text-xs">
              <div>
                <dt className="text-stone-400">Última compra</dt>
                <dd className="mt-1 font-bold">
                  {appDate(client.lastPurchase)}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Ciclo médio</dt>
                <dd className="mt-1 font-bold">
                  {client.averageCycleDays} dias
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Próxima previsão</dt>
                <dd className="mt-1 font-bold">
                  {appDate(client.nextPurchase)}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Compras em 12 meses</dt>
                <dd className="mt-1 font-bold">{money(client.total12m)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-stone-500">
                {client.contact} · {client.phone}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/clientes/novo?editId=${client.id}`} className="brand-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold"><Pencil size={14} />Editar</Link>
                <button type="button" onClick={async () => {
                  if (!confirm(`Excluir o cliente ${client.name}?`)) return;
                  setError("");
                  try {
                    if (window.halexDesktop) await window.halexDesktop.clients.delete(client.id);
                    else {
                      const stored = JSON.parse(localStorage.getItem("manualClients") || "[]") as Array<{ id: string }>;
                      localStorage.setItem("manualClients", JSON.stringify(stored.filter((item) => item.id !== client.id)));
                    }
                    window.location.reload();
                  } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o cliente."); }
                }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} />Excluir</button>
                <Link href={`/dashboard/cotacoes/nova?cliente=${client.id}`} className="brand-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold"><FilePlus2 size={14} />Criar cotação</Link>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
