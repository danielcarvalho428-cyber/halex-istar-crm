"use client";

import Link from "next/link";
import { FilePlus2, ReceiptText, Pencil, Trash2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { money } from "@/lib/crm-preview";
import { notifyCrmDataChanged, useDesktopQuotations } from "@/lib/use-desktop-data";
import { useAppUX } from "@/components/AppUX";

export default function QuotationsPage() {
  const quotations = useDesktopQuotations();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recentes");
  const { confirm, toast } = useAppUX();
  const visible = useMemo(() => quotations.filter((quote) => `${quote.quote_number} ${quote.client_name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "valor" ? Number(b.total_value) - Number(a.total_value) : String(b.issued_at).localeCompare(String(a.issued_at))), [quotations, query, sort]);

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Excluir esta cotação?", description: "A proposta deixará de aparecer no histórico deste computador.", confirmLabel: "Excluir cotação", destructive: true })) return;
    if (window.halexDesktop) {
      await window.halexDesktop.quotations.delete(id);
      notifyCrmDataChanged(); toast("Cotação excluída.");
      return;
    }
    const manualStored = localStorage.getItem("manualQuotations");
    if (manualStored) {
      const parsed: DesktopQuotation[] = JSON.parse(manualStored);
      const updated = parsed.filter((quote) => String(quote.id) !== id);
      localStorage.setItem("manualQuotations", JSON.stringify(updated));
      notifyCrmDataChanged(); toast("Cotação excluída.");
    }
  };
  return (
    <div className="space-y-6">
      <header className="page-hero flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="lumina-kicker">Propostas</p>
          <h1 className="mt-2">Cotações</h1>
          <p className="mt-2 text-sm text-stone-500">
            Rascunhos e propostas armazenados neste computador.
          </p>
        </div>
        <Link
          href="/dashboard/cotacoes/nova"
          className="brand-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold"
        >
          <FilePlus2 size={16} />
          Nova cotação
        </Link>
      </header>
      <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15}/><span className="sr-only">Buscar cotações</span><input className="form-input input-with-icon w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar número ou cliente"/></label><span className="text-xs text-stone-500">{visible.length} resultado(s)</span><select aria-label="Ordenar cotações" className="form-input text-xs" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recentes">Mais recentes</option><option value="valor">Maior valor</option></select></div>
      <section className="glass-card overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-10 text-center">
            <ReceiptText className="mx-auto text-amber-700" size={32} />
            <h2 className="mt-3 font-semibold">Nenhuma cotação salva</h2>
            <p className="mt-2 text-sm text-stone-500">
              Crie a primeira proposta; ela ficará registrada somente neste
              computador.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px] w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Cotação</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Emissão</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((quote) => (
                  <tr key={String(quote.id)}>
                    <td className="px-4 py-4 font-mono text-xs font-bold">
                      {String(quote.quote_number)}
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {String(quote.client_name)}
                    </td>
                    <td className="px-4 py-4 text-stone-500">
                      {new Date(
                        `${String(quote.issued_at)}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                        Rascunho
                      </span>
                    </td>
                    <td className="money-cell px-4 py-4 font-bold">
                      {money(Number(quote.total_value))}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/cotacoes/nova?editId=${quote.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-900"
                          title="Editar"
                          aria-label={`Editar cotação ${quote.quote_number}`}
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(String(quote.id))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700"
                          title="Excluir"
                          aria-label={`Excluir cotação ${quote.quote_number}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
