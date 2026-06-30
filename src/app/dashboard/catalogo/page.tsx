"use client";

import { useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { money } from "@/lib/crm-preview";
import { useDesktopProducts } from "@/lib/use-desktop-data";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const allProducts = useDesktopProducts();
  const products = useMemo(
    () =>
      allProducts.filter((item) =>
        `${item.code} ${item.description} ${item.presentation}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [allProducts, query],
  );
  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Tabela comercial</p>
        <h1 className="mt-2">Produtos</h1>
        <p className="mt-2 text-sm text-stone-500">
          Base única de itens e preços usados nas cotações.
        </p>
      </header>
      <div className="glass-panel relative p-4">
        <Search
          className="absolute left-7 top-1/2 -translate-y-1/2 text-stone-400"
          size={16}
        />
        <input
          className="form-input w-full pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar código, produto ou apresentação"
        />
      </div>
      <section className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px] w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Apresentação</th>
                <th className="px-4 py-3 text-left">Unidade</th>
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
