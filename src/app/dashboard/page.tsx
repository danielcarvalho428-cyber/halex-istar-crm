'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CalendarClock, FilePlus2, ReceiptText, TrendingUp } from 'lucide-react';
import { appDate, money } from '@/lib/crm-preview';
import { useDesktopClients, useDesktopQuotations } from '@/lib/use-desktop-data';
import { localIsoDate } from '@/lib/date';

export default function DashboardPage() {
  const clients = useDesktopClients();
  const quotations = useDesktopQuotations();
  const immediate = clients.filter((client) => client.status === 'Comprar agora');
  const currentMonth = localIsoDate().slice(0, 7);
  const monthlyQuotes = quotations.filter((quote) =>
    String(quote.issued_at ?? '').startsWith(currentMonth),
  ).length;
  const priorities = [...clients]
    .sort((left, right) => left.nextPurchase.localeCompare(right.nextPurchase))
    .slice(0, 8);
  return (
    <div className="space-y-7">
      <header className="page-hero flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="lumina-kicker">Lumina Prisma · Hoje</p>
          <h1 className="mt-2">Inteligência comercial<br/><span className="gold-text">em movimento.</span></h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-500">Priorize clientes pelo ciclo real de compra e transforme o contato em uma cotação pronta.</p>
        </div>
        <Link href="/dashboard/cotacoes/nova" className="brand-button inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold">
          <FilePlus2 size={17} /> Nova cotação
        </Link>
      </header>

      <section className="metric-strip grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Clientes ativos', clients.length, <Building2 key="clients" size={18} />, '/dashboard/clientes'],
          ['Comprar agora', immediate.length, <CalendarClock key="cycle" size={18} />, '/dashboard/agenda'],
          ['Cotações no mês', monthlyQuotes, <ReceiptText key="quotes" size={18} />, '/dashboard/cotacoes'],
          ['Potencial da carteira', money(clients.reduce((sum, item) => sum + item.total12m, 0)), <TrendingUp key="potential" size={18} />, '/dashboard/clientes'],
        ].map(([label, value, icon, href]) => (
          <Link href={String(href)} key={String(label)} className="metric-item flex items-center justify-between p-5">
            <div><p className="text-[10px] font-bold uppercase text-stone-500">{String(label)}</p><p className="mt-2 text-2xl font-semibold">{String(value)}</p></div>
            <div className="metric-icon">{icon}</div>
          </Link>
        ))}
      </section>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div><h2 className="font-semibold">Prioridades de hoje</h2><p className="mt-1 text-xs text-stone-500">Ordenadas pela previsão de recompra.</p></div>
          <Link href="/dashboard/clientes" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">Ver carteira <ArrowRight size={14} /></Link>
        </div>
        <div className="divide-y divide-stone-100">
          {priorities.map((client) => (
            <article key={client.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{client.name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${client.status === 'Comprar agora' ? 'bg-red-50 text-red-700' : client.status === 'Contato próximo' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{client.status}</span></div><p className="mt-1 text-xs text-stone-500">{client.city}/{client.state} · {client.contact} · Última compra {appDate(client.lastPurchase)}</p></div>
              <div className="text-left md:text-right"><p className="text-[10px] font-bold uppercase text-stone-400">Próxima compra</p><p className="mt-1 text-sm font-bold">{appDate(client.nextPurchase)}</p></div>
              <Link href={`/dashboard/cotacoes/nova?cliente=${client.id}`} className="brand-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold"><FilePlus2 size={14} /> Cotar</Link>
            </article>
          ))}
          {priorities.length === 0 && (
            <div className="p-8 text-center text-sm text-stone-500">
              Nenhum cliente cadastrado para priorizar.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
