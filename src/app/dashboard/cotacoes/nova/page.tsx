"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown, Plus, Printer, Search, Trash2 } from "lucide-react";
import {
  appDate,
  money,
  previewClients,
  previewProducts,
} from "@/lib/crm-preview";

type QuoteLine = { productId: string; quantity: number; unitPrice: number };

function Builder() {
  const params = useSearchParams();
  const [clientId, setClientId] = useState(
    params.get("cliente") || previewClients[0].id,
  );
  const [lines, setLines] = useState<QuoteLine[]>([
    {
      productId: previewProducts[0].id,
      quantity: 1,
      unitPrice: previewProducts[0].price,
    },
  ]);
  const [search, setSearch] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [payment, setPayment] = useState("30 dias");
  const [delivery, setDelivery] = useState(
    "Até 10 dias úteis após confirmação",
  );
  const [seller, setSeller] = useState("Paulo Roberto");
  const [freight, setFreight] = useState("CIF - incluso no valor da proposta");
  const [notes, setNotes] = useState(
    "Preços expressos em reais. Produtos sujeitos à disponibilidade no momento da confirmação do pedido.",
  );
  const client = previewClients.find((item) => item.id === clientId)!;
  const filtered = previewProducts.filter((item) =>
    `${item.code} ${item.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const issued = new Date();
  const valid = new Date();
  valid.setDate(valid.getDate() + validDays);
  const quoteNumber = `HI-${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, "0")}001`;

  function add(productId: string) {
    const product = previewProducts.find((item) => item.id === productId)!;
    setLines((current) => {
      const found = current.find((line) => line.productId === productId);
      return found
        ? current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [...current, { productId, quantity: 1, unitPrice: product.price }];
    });
  }
  function update(index: number, patch: Partial<QuoteLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <header className="print-hidden page-hero flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="lumina-kicker">Gerador comercial</p>
          <h1 className="mt-2">Nova cotação</h1>
          <p className="mt-2 text-sm text-stone-500">
            Escolha o cliente e os produtos. O documento é calculado e montado
            automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
          >
            <FileDown size={15} />
            Gerar PDF
          </button>
        </div>
      </header>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="print-hidden space-y-5">
          <section className="glass-card p-5">
            <h2 className="font-semibold">Cliente e condições</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-bold md:col-span-2">
                Cliente
                <select
                  className="form-input mt-2 w-full"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {previewClients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold">
                Validade
                <input
                  type="number"
                  min="1"
                  className="form-input mt-2 w-full"
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value) || 1)}
                />
              </label>
              <label className="text-xs font-bold">
                Vendedor
                <input
                  className="form-input mt-2 w-full"
                  value={seller}
                  onChange={(e) => setSeller(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold">
                Pagamento
                <input
                  className="form-input mt-2 w-full"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold">
                Frete
                <input
                  className="form-input mt-2 w-full"
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold">
                Entrega
                <input
                  className="form-input mt-2 w-full"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                />
              </label>
              <label className="text-xs font-bold md:col-span-2">
                Observações
                <textarea
                  rows={3}
                  className="form-input mt-2 w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Adicionar produtos</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Tabela comercial Halex Istar.
                </p>
              </div>
            </div>
            <div className="relative mt-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={15}
              />
              <input
                className="form-input w-full pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar código ou produto"
              />
            </div>
            <div className="mt-3 divide-y divide-stone-100">
              {filtered.map((product) => (
                <div key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {product.description}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {product.code} · {product.presentation}
                    </p>
                  </div>
                  <p className="money-value text-sm font-bold">
                    {money(product.price)}
                  </p>
                  <button
                    type="button"
                    onClick={() => add(product.id)}
                    className="brand-secondary inline-flex h-9 w-9 items-center justify-center"
                    title="Adicionar produto"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="border-b border-stone-100 p-5">
              <h2 className="font-semibold">Itens da cotação</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {lines.map((line, index) => {
                const product = previewProducts.find(
                  (item) => item.id === line.productId,
                )!;
                return (
                  <div
                    key={product.id}
                    className="grid gap-3 p-4 md:grid-cols-[1fr_100px_150px_120px_40px] md:items-end"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {product.description}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {product.code} · {product.presentation}
                      </p>
                    </div>
                    <label className="text-[10px] font-bold uppercase text-stone-500">
                      Quantidade
                      <input
                        type="number"
                        min="1"
                        className="form-input mt-1 w-full"
                        value={line.quantity}
                        onChange={(e) =>
                          update(index, {
                            quantity: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </label>
                    <label className="text-[10px] font-bold uppercase text-stone-500">
                      Preço unitário
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input mt-1 w-full"
                        value={line.unitPrice}
                        onChange={(e) =>
                          update(index, {
                            unitPrice: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-stone-500">
                        Total
                      </p>
                      <p className="money-value mt-3 text-sm font-bold">
                        {money(line.quantity * line.unitPrice)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600"
                      title="Remover item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end border-t border-stone-200 bg-stone-50 p-5">
              <div className="text-right">
                <p className="text-xs text-stone-500">Total da cotação</p>
                <p className="money-value mt-1 text-2xl font-bold">
                  {money(subtotal)}
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="print-document mx-auto w-full max-w-[740px] self-start bg-white p-5 shadow-sm 2xl:sticky 2xl:top-6">
          <div className="quotation-sheet flex min-h-[920px] flex-col border border-stone-200 p-8">
            <header className="border-b-2 border-[#172033] pb-5">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-2xl font-black text-[#172033]">
                    HALEX ISTAR
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase text-amber-700">
                    Cotação comercial
                  </p>
                </div>
                <div className="rounded border border-dashed border-stone-300 px-3 py-2 text-center text-[9px] text-stone-400">
                  Papel timbrado
                  <br />
                  será aplicado aqui
                </div>
              </div>
            </header>
            <section className="quotation-keep mt-6 grid grid-cols-3 gap-4 border-b border-stone-200 pb-5 text-xs">
              <div>
                <p className="text-stone-400">Cotação</p>
                <p className="mt-1 font-bold">{quoteNumber}</p>
              </div>
              <div>
                <p className="text-stone-400">Consultor comercial</p>
                <p className="mt-1 font-bold">{seller}</p>
              </div>
              <div className="text-right">
                <p className="text-stone-400">Emissão / validade</p>
                <p className="mt-1 font-bold">
                  {issued.toLocaleDateString("pt-BR")} ·{" "}
                  {valid.toLocaleDateString("pt-BR")}
                </p>
              </div>
            </section>
            <section className="quotation-keep mt-5 border-l-4 border-amber-500 bg-stone-50 p-4 text-xs">
              <p className="text-[9px] font-bold uppercase text-stone-400">
                Cliente
              </p>
              <p className="mt-1 text-sm font-bold">{client.name}</p>
              <p className="mt-1 text-stone-500">
                Código {client.code} · {client.contact} · {client.email}
                <br />
                {client.city}/{client.state} · {client.phone}
              </p>
            </section>
            <table className="quotation-table mt-6 w-full text-[10px]">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Descrição</th>
                  <th className="px-2 py-2 text-right">Qtd.</th>
                  <th className="px-2 py-2 text-right">Unitário</th>
                  <th className="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const product = previewProducts.find(
                    (item) => item.id === line.productId,
                  )!;
                  return (
                    <tr key={product.id} className="border-b border-stone-100">
                      <td className="px-2 py-3">{index + 1}</td>
                      <td className="px-2 py-3">
                        <span className="font-mono text-[9px] text-stone-500">
                          {product.code}
                        </span>
                        <br />
                        <strong>{product.description}</strong>
                        <br />
                        <span className="text-stone-500">
                          {product.presentation}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right">{line.quantity}</td>
                      <td className="px-2 py-3 text-right">
                        {money(line.unitPrice)}
                      </td>
                      <td className="px-2 py-3 text-right font-bold">
                        {money(line.quantity * line.unitPrice)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="quotation-keep mt-5 flex justify-end">
              <div className="w-64 bg-[#172033] px-5 py-4 text-right text-white">
                <p className="text-[9px] font-bold uppercase text-stone-300">
                  Valor total da proposta
                </p>
                <p className="mt-1 text-xl font-black text-white">
                  {money(subtotal)}
                </p>
              </div>
            </div>
            <section className="quotation-keep mt-7 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 border-y border-stone-200 py-4 text-[10px]">
              <strong>Pagamento</strong>
              <span>{payment}</span>
              <strong>Entrega</strong>
              <span>{delivery}</span>
              <strong>Frete</strong>
              <span>{freight}</span>
              <strong>Validade</strong>
              <span>{validDays} dias</span>
            </section>
            <section className="quotation-keep mt-5 text-[9px] leading-relaxed text-stone-500">
              <p className="font-bold uppercase text-stone-700">
                Observações comerciais
              </p>
              <p className="mt-2">{notes}</p>
            </section>
            <section className="quotation-keep mt-10 grid grid-cols-2 gap-12 text-center text-[9px] text-stone-500">
              <div className="border-t border-stone-400 pt-2">
                {seller}
                <br />
                <strong className="text-stone-700">Consultor comercial</strong>
              </div>
              <div className="border-t border-stone-400 pt-2">
                Nome e assinatura
                <br />
                <strong className="text-stone-700">Aceite do cliente</strong>
              </div>
            </section>
            <footer className="mt-auto border-t border-stone-200 pt-4 text-center text-[9px] text-stone-400">
              Halex Istar · Proposta gerada pelo CRM comercial ·{" "}
              {appDate(issued.toISOString().slice(0, 10))}
            </footer>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-sm text-stone-500">
          Preparando cotação...
        </div>
      }
    >
      <Builder />
    </Suspense>
  );
}
