"use client";

import Link from "next/link";
import { FilePlus2, FileSpreadsheet, ReceiptText, Pencil, Trash2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { money } from "@/lib/crm-preview";
import {
  notifyCrmDataChanged,
  useDesktopClients,
  useDesktopProducts,
  useDesktopQuotations,
} from "@/lib/use-desktop-data";
import { useAppUX } from "@/components/AppUX";

type StoredItem = Record<string, unknown>;

export default function QuotationsPage() {
  const quotations = useDesktopQuotations();
  const clients = useDesktopClients();
  const products = useDesktopProducts();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recentes");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const { confirm, toast } = useAppUX();
  const visible = useMemo(() => quotations.filter((quote) => `${quote.quote_number} ${quote.client_name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "valor" ? Number(b.total_value) - Number(a.total_value) : String(b.issued_at).localeCompare(String(a.issued_at))), [quotations, query, sort]);

  // Excel version of a saved cotação. Items are read back in full (the list rows
  // carry only totals), and packSize comes from the catalog — falling back to the
  // stored line total when the product no longer exists, so the sheet still adds
  // up to the value shown in the history.
  const handleExcel = async (id: string) => {
    setExportingId(id);
    try {
      let quote: Record<string, unknown> | null = null;
      if (window.halexDesktop) {
        quote = (await window.halexDesktop.quotations.get(id)) as Record<string, unknown> | null;
      } else {
        const stored = JSON.parse(localStorage.getItem("manualQuotations") || "[]");
        if (Array.isArray(stored)) {
          quote = stored.find((row: Record<string, unknown>) => String(row.id) === id) ?? null;
        }
      }
      const rawItems = (quote?.items as StoredItem[] | undefined) ?? [];
      if (!quote || rawItems.length === 0) {
        toast("Esta cotação não tem itens para exportar.", "error");
        return;
      }
      const quoteNumber = String(quote.quote_number ?? id);
      const brand = quoteNumber.startsWith("MC-") ? "Medicone" : "Halex Istar";
      const client = clients.find((row) => String(row.id) === String(quote?.client_id));
      const items = rawItems.map((item) => {
        const productId = String(item.product_id ?? "");
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        const catalogPackSize = products.find((row) => row.id === productId)?.packSize;
        const derived =
          quantity > 0 && unitPrice > 0
            ? Math.round((Number(item.total_value) || 0) / (quantity * unitPrice))
            : 1;
        return {
          code: String(item.code ?? ""),
          description: String(item.description ?? ""),
          brand: String(item.brand ?? brand),
          packSize: Math.max(1, catalogPackSize || derived || 1),
          quantityMode: item.quantity_mode === "units" ? ("units" as const) : ("boxes" as const),
          quantity,
          unitQuantity: item.unit_quantity == null ? null : Number(item.unit_quantity),
          unitPrice,
        };
      });

      const { buildQuotationSheet } = await import("@/lib/quotation-export");
      const { downloadQuotationSheet } = await import("@/lib/quotation-excel");
      await downloadQuotationSheet(
        buildQuotationSheet({
          brand,
          quoteNumber,
          client: {
            name: String(quote.client_name ?? client?.name ?? "Cliente"),
            cnpj: client?.cnpj ?? null,
            city: client?.city ?? null,
            state: client?.state ?? null,
          },
          issuedAt: String(quote.issued_at ?? ""),
          validUntil: quote.valid_until ? String(quote.valid_until) : undefined,
          payment: quote.payment_terms ? String(quote.payment_terms) : undefined,
          delivery: quote.delivery_terms ? String(quote.delivery_terms) : undefined,
          freight: quote.freight_terms ? String(quote.freight_terms) : undefined,
          notes: quote.notes ? String(quote.notes) : undefined,
          minimumBilling: quote.minimum_billing == null ? null : Number(quote.minimum_billing),
          seller: quote.seller ? String(quote.seller) : undefined,
          representativeRole: quote.representative_role ? String(quote.representative_role) : undefined,
          representativePhone: quote.representative_phone ? String(quote.representative_phone) : undefined,
          representativeEmail: quote.representative_email ? String(quote.representative_email) : undefined,
          salesPriceTable: quote.sales_price_table ? String(quote.sales_price_table) : undefined,
          salesPriceRegion: quote.sales_price_region ? String(quote.sales_price_region) : undefined,
          items,
        }),
      );
      toast("Excel da cotação gerado.");
    } catch {
      toast("Não foi possível gerar o Excel desta cotação.", "error");
    } finally {
      setExportingId(null);
    }
  };

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
                        <button
                          type="button"
                          onClick={() => void handleExcel(String(quote.id))}
                          disabled={exportingId === String(quote.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          title="Exportar em Excel"
                          aria-label={`Exportar cotação ${quote.quote_number} em Excel`}
                        >
                          <FileSpreadsheet size={14} />
                        </button>
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
