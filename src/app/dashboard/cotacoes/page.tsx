"use client";

import Link from "next/link";
import { FilePlus2, ReceiptText, Pencil, Trash2 } from "lucide-react";
import { money } from "@/lib/crm-preview";
import { useDesktopQuotations } from "@/lib/use-desktop-data";

export default function QuotationsPage() {
  const quotations = useDesktopQuotations();

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta cotação?")) return;
    if (window.halexDesktop) {
      await window.halexDesktop.quotations.delete(id);
      window.location.reload();
      return;
    }
    const manualStored = localStorage.getItem("manualQuotations");
    if (manualStored) {
      const parsed: DesktopQuotation[] = JSON.parse(manualStored);
      const updated = parsed.filter((quote) => String(quote.id) !== id);
      localStorage.setItem("manualQuotations", JSON.stringify(updated));
      window.location.reload();
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
      <section className="glass-card overflow-hidden">
        {quotations.length === 0 ? (
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
                {quotations.map((quote) => (
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
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(String(quote.id))}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700"
                          title="Excluir"
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
