"use client";

import Link from "next/link";
import { CalendarClock, FilePlus2, Phone } from "lucide-react";
import { appDate } from "@/lib/crm-preview";
import { useDesktopClients } from "@/lib/use-desktop-data";

export default function AgendaPage() {
  const clients = [...useDesktopClients()].sort((left, right) =>
    left.nextPurchase.localeCompare(right.nextPurchase),
  );

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Follow-up</p>
        <h1 className="mt-2">Agenda comercial</h1>
        <p className="mt-2 text-sm text-stone-500">
          Retornos e oportunidades guiados pelo ciclo de compra.
        </p>
      </header>
      <section className="glass-card overflow-hidden">
        <div className="border-b border-stone-100 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock size={17} className="text-amber-700" />
            Próximos contatos
          </h2>
        </div>
        <div className="divide-y divide-stone-100">
          {clients.map((client) => (
            <article
              key={client.id}
              className="grid gap-4 p-5 md:grid-cols-[120px_1fr_auto] md:items-center"
            >
              <div>
                <p className="text-[10px] font-bold uppercase text-stone-400">Previsão</p>
                <p className="mt-1 text-sm font-bold">{appDate(client.nextPurchase)}</p>
              </div>
              <div>
                <h3 className="font-semibold">{client.name}</h3>
                <p className="mt-1 text-xs text-stone-500">
                  {client.contact || "Contato não informado"} · ciclo de{" "}
                  {client.averageCycleDays || 0} dias · {client.phone || "sem telefone"}
                </p>
              </div>
              <div className="flex gap-2">
                {client.phone && (
                  <a
                    href={`tel:${client.phone.replace(/\D/g, "")}`}
                    className="brand-secondary inline-flex h-10 w-10 items-center justify-center"
                    aria-label={`Ligar para ${client.name}`}
                  >
                    <Phone size={15} />
                  </a>
                )}
                <Link
                  href={`/dashboard/cotacoes/nova?cliente=${client.id}`}
                  className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
                >
                  <FilePlus2 size={14} /> Cotar
                </Link>
              </div>
            </article>
          ))}
          {clients.length === 0 && (
            <p className="p-8 text-center text-sm text-stone-500">
              Nenhum cliente cadastrado para acompanhamento.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
