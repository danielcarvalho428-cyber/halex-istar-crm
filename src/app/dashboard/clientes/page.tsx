"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CopyCheck, FilePlus2, MailSearch, Search, UserRoundCheck, MapPin, UserCircle2, Pencil, Trash2 } from "lucide-react";
import { CARTEIRA_OPTIONS, CLIENT_TYPE_OPTIONS, appDate, clientTypeLabel, money } from "@/lib/crm-preview";
import { notifyCrmDataChanged, useDesktopClients } from "@/lib/use-desktop-data";
import { useAppUX } from "@/components/AppUX";
import { clientIdentityLabel, quarantinedClientIds } from "@/lib/client-duplicates";

export default function ClientsPage() {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [sort, setSort] = useState("prioridade");
  const [clientType, setClientType] = useState("Todos");
  const [carteira, setCarteira] = useState("Todas");
  const [showQuarantined, setShowQuarantined] = useState(false);
  const { confirm, toast } = useAppUX();
  const allClients = useDesktopClients();
  // Cadastros that repeat a CNPJ stay out of the carteira until the user
  // resolves them, so nobody works a duplicated cliente by accident.
  const quarantined = useMemo(() => quarantinedClientIds(allClients), [allClients]);
  const missingEmailCount = allClients.filter(
    (client) => !quarantined.has(client.id) && !client.email?.trim(),
  ).length;
  const clients = useMemo(
    () =>
      allClients.filter((client) => (showQuarantined ? quarantined.has(client.id) : !quarantined.has(client.id)) &&
        (status === "Todos" || client.status === status) &&
        (clientType === "Todos" || (client.clientType || "hospital") === clientType) &&
        (carteira === "Todas" || client.carteira === carteira) &&
        `${client.name} ${client.code} ${client.city} ${client.contact}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ).sort((a, b) => sort === "nome" ? a.name.localeCompare(b.name) : sort === "potencial" ? b.total12m - a.total12m : a.nextPurchase.localeCompare(b.nextPurchase)),
    [allClients, carteira, clientType, quarantined, query, showQuarantined, sort, status],
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
      {quarantined.size > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold">
            <CopyCheck className="mr-2 inline" size={15} />
            {quarantined.size} cadastro(s) em quarentena por CNPJ repetido.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowQuarantined((current) => !current)} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
              {showQuarantined ? "Ver carteira ativa" : "Ver duplicados aqui"}
            </button>
            <Link href="/dashboard/clientes/duplicados" className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
              Revisar e excluir em lote
            </Link>
          </div>
        </div>
      )}
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
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-stone-500">{clients.length} de {allClients.length - quarantined.size} clientes ativos</span><select aria-label="Filtrar por status" className="form-input ml-auto text-xs" value={status} onChange={(e) => setStatus(e.target.value)}><option>Todos</option><option>Comprar agora</option><option>Contato próximo</option><option>Em ciclo</option></select><select aria-label="Filtrar por tipo de cliente" className="form-input text-xs" value={clientType} onChange={(e) => setClientType(e.target.value)}><option value="Todos">Todos os tipos</option>{CLIENT_TYPE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select><select aria-label="Filtrar por carteira" className="form-input text-xs" value={carteira} onChange={(e) => setCarteira(e.target.value)}><option value="Todas">Todas as carteiras</option>{CARTEIRA_OPTIONS.map((item) => (<option key={item} value={item}>{item}</option>))}</select><select aria-label="Ordenar clientes" className="form-input text-xs" value={sort} onChange={(e) => setSort(e.target.value)}><option value="prioridade">Prioridade</option><option value="nome">Nome</option><option value="potencial">Maior potencial</option></select></div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href="/dashboard/clientes/novo" className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
              <FilePlus2 size={14} />
              Adicionar cliente
            </Link>
            {missingEmailCount > 0 && (
              <Link href="/dashboard/clientes/emails" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
                <MailSearch size={14} />
                Buscar e-mails ({missingEmailCount} sem contato)
              </Link>
            )}
          </div>

      <section className="grid gap-4 xl:grid-cols-2">
        {clients.map((client) => (
          <article key={client.id} className="glass-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserRoundCheck size={17} className="text-amber-700" />
                  <h2 className="font-semibold">{client.name}</h2>
                </div>
                {(() => {
                  const identity = clientIdentityLabel(client);
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{identity.code}</span>
                      <span className={`rounded-full px-2 py-1 ${identity.hasCnpj ? "bg-stone-100 text-stone-700" : "bg-amber-50 text-amber-800"}`}>{identity.cnpj}</span>
                      {quarantined.has(client.id) && (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">Duplicado · quarentena</span>
                      )}
                    </div>
                  );
                })()}
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
              <div className="flex flex-wrap items-center gap-2">
                {client.clientType && (
                  <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-bold text-stone-600">
                    {clientTypeLabel(client.clientType)}
                  </span>
                )}
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
                  {client.status}
                </span>
              </div>
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
                  if (!await confirm({ title: `Excluir ${client.name}?`, description: "O cliente será removido da carteira. Cotações históricas protegidas serão mantidas.", confirmLabel: "Excluir cliente", destructive: true })) return;
                  setError("");
                  try {
                    if (window.halexDesktop) await window.halexDesktop.clients.delete(client.id);
                    else {
                      const stored = JSON.parse(localStorage.getItem("manualClients") || "[]") as Array<{ id: string }>;
                      localStorage.setItem("manualClients", JSON.stringify(stored.filter((item) => item.id !== client.id)));
                    }
                    notifyCrmDataChanged(); toast("Cliente excluído da carteira.");
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
