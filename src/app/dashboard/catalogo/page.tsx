"use client";

import { useMemo, useState } from "react";
import { Check, FileSpreadsheet, PackageSearch, Pencil, RefreshCw, Search, X } from "lucide-react";
import { money } from "@/lib/crm-preview";
import { buildProductSheets } from "@/lib/product-export";
import { useDesktopProducts } from "@/lib/use-desktop-data";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const allProducts = useDesktopProducts();
  // A embalagem corrigida à mão, para a tela refletir o que já foi gravado.
  const [packSizes, setPackSizes] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [savingPack, setSavingPack] = useState(false);
  const products = useMemo(
    () =>
      allProducts.filter((item) =>
        `${item.code} ${item.description} ${item.presentation}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [allProducts, query],
  );

  function packSizeOf(item: { id: string; packSize?: number }) {
    return Math.max(1, packSizes[item.id] ?? item.packSize ?? 1);
  }

  // A correção é guardada por código, então sobrevive à próxima importação.
  async function savePackSize(item: { id: string; code: string }) {
    if (!editing) return;
    const value = Math.trunc(Number(editing.value));
    if (!Number.isFinite(value) || value < 1) {
      setNotice("Informe a quantidade da caixa como um número inteiro maior que zero.");
      return;
    }
    setSavingPack(true);
    try {
      await window.halexDesktop?.products?.setPackSize(item.code, value);
      setPackSizes((current) => ({ ...current, [item.id]: value }));
      setEditing(null);
      setNotice(`Embalagem do produto ${item.code} salva: caixa com ${value} unidade(s).`);
    } catch {
      setNotice("Não foi possível salvar a quantidade da caixa.");
    } finally {
      setSavingPack(false);
    }
  }

  // One .xlsx per brand, so Halex Istar and Medicone can be sent separately.
  async function exportExcel(withPrices: boolean) {
    const sheets = buildProductSheets(
      products.map((item) => ({ ...item, packSize: packSizeOf(item) })),
      { withPrices },
    );
    if (!sheets.length) {
      setNotice("Nenhum produto para exportar com o filtro atual.");
      return;
    }
    setExporting(true);
    setNotice("");
    try {
      const XLSX = await import("xlsx");
      for (const sheet of sheets) {
        const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
        worksheet["!cols"] = sheet.columnWidths.map((wch) => ({ wch }));
        for (const address of Object.keys(worksheet)) {
          const cell = worksheet[address] as { t?: string; z?: string };
          if (cell?.t === "n") cell.z = "#,##0.00";
        }
        worksheet["!merges"] = [0, 1, 2, 3].map((r) => ({
          s: { r, c: 0 },
          e: { r, c: sheet.columnWidths.length - 1 },
        }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.brand.slice(0, 31));
        XLSX.writeFile(workbook, sheet.fileName, { compression: true });
      }
      setNotice(
        `Exportado: ${sheets.map((sheet) => sheet.brand).join(" e ")} (${withPrices ? "com preços" : "sem preços"}).`,
      );
    } catch {
      setNotice("Não foi possível gerar o Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Tabela comercial</p>
        <h1 className="mt-2">Produtos</h1>
        <p className="mt-2 text-sm text-stone-500">
          Base única de itens e preços usados nas cotações.
        </p>
      </header>
      <div className="glass-panel space-y-3 p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            size={16}
          />
          <input
            className="form-input input-with-icon w-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código, produto ou apresentação"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
            disabled={exporting}
            onClick={() => void exportExcel(true)}
          >
            {exporting ? <RefreshCw className="animate-spin" size={15} /> : <FileSpreadsheet size={15} />}
            Excel com preços
          </button>
          <button
            type="button"
            className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
            disabled={exporting}
            onClick={() => void exportExcel(false)}
          >
            {exporting ? <RefreshCw className="animate-spin" size={15} /> : <FileSpreadsheet size={15} />}
            Excel sem preços
          </button>
          <span className="text-xs text-stone-500">
            {notice ||
              "Gera um arquivo para Halex Istar e outro para Medicone, seguindo o filtro atual. Clique na embalagem para corrigir a quantidade da caixa."}
          </span>
        </div>
      </div>
      <section className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[860px] w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Apresentação</th>
                <th className="px-4 py-3 text-left">Unidade</th>
                <th className="px-4 py-3 text-left">Embalagem</th>
                <th className="px-4 py-3 text-right">Preço</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-mono text-xs font-bold">
                    {item.code}
                  </td>
                  <td className="px-4 py-4 font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <PackageSearch size={14} className="text-amber-700" />
                      {item.description}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-stone-500">
                    {item.presentation}
                  </td>
                  <td className="px-4 py-4 text-xs">{item.unit}</td>
                  <td className="px-4 py-4 text-xs font-bold text-amber-800">
                    {editing?.id === item.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          autoFocus
                          className="form-input w-24 py-1 text-xs"
                          value={editing.value}
                          onChange={(e) =>
                            setEditing({ id: item.id, value: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void savePackSize(item);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Salvar embalagem"
                          disabled={savingPack}
                          className="rounded-lg border border-stone-200 p-1.5 text-emerald-700 disabled:opacity-40"
                          onClick={() => void savePackSize(item)}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar"
                          className="rounded-lg border border-stone-200 p-1.5 text-stone-500"
                          onClick={() => setEditing(null)}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-amber-50"
                        title="Corrigir a quantidade da caixa"
                        onClick={() =>
                          setEditing({ id: item.id, value: String(packSizeOf(item)) })
                        }
                      >
                        Caixa com {packSizeOf(item)} unidade(s)
                        <Pencil size={12} className="text-stone-400" />
                      </button>
                    )}
                  </td>
                  <td className="money-cell px-4 py-4 font-bold">
                    {money(item.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
