"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Handshake,
  Plus,
  Save,
  Tag,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { money } from "@/lib/crm-preview";
import {
  useDesktopClients,
  useDesktopProducts,
} from "@/lib/use-desktop-data";

export default function AgreementsPage() {
  const clients = useDesktopClients();
  const products = useDesktopProducts();
  const [groups, setGroups] = useState<DesktopAgreementGroup[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [productCode, setProductCode] = useState("");
  const [specialPrice, setSpecialPrice] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (preferredId?: string) => {
    const values = await window.halexDesktop?.agreements.list();
    if (!values) return;
    setGroups(values);
    setSelectedId((current) => {
      const target = preferredId || current;
      return values.some((group) => group.id === target)
        ? target
        : values[0]?.id || "";
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const selected = groups.find((group) => group.id === selectedId) ?? null;
  const memberships = useMemo(
    () =>
      new Map(
        groups.flatMap((group) =>
          group.clients.map((client) => [client.id, group.name] as const),
        ),
      ),
    [groups],
  );

  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await action();
      await load(selectedId);
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operação não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!window.halexDesktop) return;
    let createdId = "";
    await perform(async () => {
      createdId = await window.halexDesktop!.agreements.save({
        name: groupName,
        description: groupDescription,
      });
      setGroupName("");
      setGroupDescription("");
      await load(createdId);
    }, "Acordo criado.");
  }

  async function addClient() {
    if (!window.halexDesktop || !selected || !clientId) return;
    const client = clients.find((value) => value.id === clientId);
    await perform(
      () => window.halexDesktop!.agreements.addClient(selected.id, clientId),
      `${client?.name || "Cliente"} adicionado ao acordo.`,
    );
    setClientId("");
  }

  async function addPrice(event: React.FormEvent) {
    event.preventDefault();
    if (!window.halexDesktop || !selected || !productCode) return;
    await perform(
      () =>
        window.halexDesktop!.agreements.savePrice(
          selected.id,
          productCode,
          Number(specialPrice),
        ),
      "Preço especial salvo.",
    );
    setProductCode("");
    setSpecialPrice("");
  }

  async function importPrices() {
    if (!window.halexDesktop || !selected) return;
    if (selected.prices.length > 0 && !confirm(`Substituir os ${selected.prices.length} preços atuais do grupo ${selected.name}?`)) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const result = await window.halexDesktop.agreements.importPrices(selected.id);
      if (!result) return;
      await load(selected.id);
      const unmatched = result.imported - result.matchedProducts;
      setNotice(`${result.fileName}: ${result.imported} preços importados para ${selected.name}${unmatched > 0 ? ` · ${unmatched} código(s) não encontrado(s) no catálogo` : ""}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível importar a tabela.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Política comercial</p>
        <h1 className="mt-2">Acordos de preços</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Organize clientes em grupos e mantenha preços especiais por produto.
          O preço do acordo entra automaticamente na cotação e continua editável.
        </p>
      </header>

      {typeof window !== "undefined" && !window.halexDesktop && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          Os acordos ficam disponíveis no aplicativo desktop instalado.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <form onSubmit={(event) => void createGroup(event)} className="glass-card p-5">
            <div className="flex items-center gap-2"><Plus size={16} className="text-amber-700" /><h2 className="font-semibold">Novo grupo</h2></div>
            <label className="mt-4 block text-xs font-bold">Nome<input required className="form-input mt-2 w-full" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex.: Rede Premium" /></label>
            <label className="mt-3 block text-xs font-bold">Descrição<textarea rows={2} className="form-input mt-2 w-full" value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} /></label>
            <button disabled={busy} className="brand-button mt-4 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-bold"><Save size={14} /> Criar acordo</button>
          </form>

          <section className="glass-card overflow-hidden">
            <div className="border-b border-stone-200 p-4"><h2 className="flex items-center gap-2 font-semibold"><Handshake size={16} className="text-amber-700" /> Grupos</h2></div>
            {groups.length === 0 ? <p className="p-5 text-sm text-stone-500">Nenhum acordo criado.</p> : groups.map((group) => (
              <button key={group.id} type="button" onClick={() => setSelectedId(group.id)} className={`w-full border-b border-stone-100 p-4 text-left last:border-0 ${selectedId === group.id ? "bg-amber-50" : "hover:bg-stone-50"}`}>
                <p className="font-semibold text-stone-900">{group.name}</p>
                <p className="mt-1 text-xs text-stone-500">{group.clients.length} cliente(s) · {group.prices.length} preço(s)</p>
              </button>
            ))}
          </section>
        </aside>

        {selected ? (
          <div className="space-y-5">
            <section className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="lumina-kicker">Acordo selecionado</p><h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-stone-500">{selected.description || "Sem descrição."}</p></div>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir o acordo ${selected.name}?`)) void perform(() => window.halexDesktop!.agreements.delete(selected.id), "Acordo excluído."); }} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} /> Excluir grupo</button>
              </div>
            </section>

            <section className="glass-card overflow-hidden">
              <div className="border-b border-stone-200 p-5"><h2 className="flex items-center gap-2 font-semibold"><Users size={17} className="text-amber-700" /> Clientes do grupo</h2><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select className="form-input min-w-0 flex-1" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Selecione um cliente</option>{clients.filter((client) => !selected.clients.some((member) => member.id === client.id)).map((client) => <option key={client.id} value={client.id}>{client.code} · {client.name}{memberships.has(client.id) ? ` — mover de ${memberships.get(client.id)}` : ""}</option>)}</select><button type="button" disabled={!clientId || busy} onClick={() => void addClient()} className="brand-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-50"><UserPlus size={14} /> Adicionar</button></div></div>
              {selected.clients.length === 0 ? <p className="p-6 text-sm text-stone-500">Nenhum cliente neste grupo.</p> : <div className="divide-y divide-stone-100">{selected.clients.map((client) => <div key={client.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">{client.name}</p><p className="mt-1 text-xs text-stone-500">{client.code} · {client.city}/{client.state}</p></div><button type="button" aria-label={`Remover ${client.name}`} onClick={() => void perform(() => window.halexDesktop!.agreements.removeClient(selected.id, client.id), "Cliente removido do acordo.")} className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:text-red-700"><X size={14} /></button></div>)}</div>}
            </section>

            <section className="glass-card overflow-hidden">
              <form onSubmit={(event) => void addPrice(event)} className="border-b border-stone-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Tag size={17} className="text-amber-700" /> Tabela de preços do grupo</h2><p className="mt-1 text-xs text-stone-500">Esta tabela vale somente para clientes de {selected.name}.</p>{selected.price_table_name && <p className="mt-1 text-xs font-semibold text-amber-800">Arquivo atual: {selected.price_table_name}</p>}</div><button type="button" disabled={busy} onClick={() => void importPrices()} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"><UploadCloud size={14} /> Importar planilha</button></div><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]"><select required className="form-input min-w-0" value={productCode} onChange={(event) => setProductCode(event.target.value)}><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.code}>{product.code} · {product.description}</option>)}</select><input required type="number" min="0.01" step="0.01" className="form-input" value={specialPrice} onChange={(event) => setSpecialPrice(event.target.value)} placeholder="Preço especial" /><button disabled={busy} className="brand-button px-4 py-2 text-xs font-bold">Salvar preço</button></div></form>
              {selected.prices.length === 0 ? <p className="p-6 text-sm text-stone-500">Nenhum preço especial cadastrado.</p> : <div className="divide-y divide-stone-100">{selected.prices.map((price) => <div key={price.product_code} className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm font-semibold">{price.description || price.product_code}</p><p className="mt-1 font-mono text-xs text-stone-500">{price.product_code}</p></div><div className="flex items-center gap-3"><p className="font-bold text-emerald-800">{money(Number(price.price))}</p><button type="button" aria-label={`Excluir preço ${price.product_code}`} onClick={() => void perform(() => window.halexDesktop!.agreements.deletePrice(selected.id, price.product_code), "Preço especial excluído.")} className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:text-red-700"><Trash2 size={14} /></button></div></div>)}</div>}
            </section>
          </div>
        ) : (
          <section className="glass-card flex min-h-72 items-center justify-center p-8 text-center text-sm text-stone-500">Crie ou selecione um grupo para administrar clientes e preços.</section>
        )}
      </div>
    </div>
  );
}
