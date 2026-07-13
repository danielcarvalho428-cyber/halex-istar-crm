"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  History,
  RefreshCw,
  Upload,
  Users,
  Trash2,
} from "lucide-react";

type Version = {
  id: string;
  name: string;
  imported_at: string;
  row_count: number;
  active: number;
};

export default function ImportPage() {
  const [busy, setBusy] = useState<
    "clients" | "products" | "products-medicone" | "version" | null
  >(null);
  const [message, setMessage] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeSalesTable, setActiveSalesTable] = useState<DesktopSalesPriceTable | null>(null);
  const [activeMediconeTable, setActiveMediconeTable] = useState<DesktopSalesPriceTable | null>(null);
  const loadVersions = () =>
    window.halexDesktop?.imports
      .priceVersions()
      .then(setVersions)
      .catch(() => {});
  useEffect(() => {
    void loadVersions();
    window.halexDesktop?.imports.activeSalesPriceTable().then(setActiveSalesTable).catch(() => {});
    window.halexDesktop?.imports.activeSalesPriceTableMedicone().then(setActiveMediconeTable).catch(() => {});
  }, []);

  async function importClients() {
    if (!window.halexDesktop)
      return setMessage(
        "A importação está disponível no aplicativo instalado.",
      );
    setBusy("clients");
    setMessage("");
    try {
      const result = await window.halexDesktop.imports.clients();
      if (result)
        setMessage(
          `${result.fileName}: ${result.added} clientes adicionados, ${result.updated} atualizados e ${result.ignored} linhas ignoradas.`,
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível importar os clientes.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function importProducts() {
    if (!window.halexDesktop)
      return setMessage(
        "A importação está disponível no aplicativo instalado.",
      );
    setBusy("products");
    setMessage("");
    try {
      const result = await window.halexDesktop.imports.products();
      if (result) {
        setMessage(result.kind === "sales-price-table"
          ? `${result.fileName}: tabela comercial ${result.period} ativada com ${result.imported} produtos, ${result.regions} regiões e ${result.categories} categorias${result.fallbackPrices ? `; ${result.fallbackPrices} preço(s) inválido(s) preenchido(s) pela região principal` : ""}.`
          : `${result.fileName}: nova tabela ativada com ${result.imported} produtos; ${result.ignored} linhas ignoradas.`);
        await loadVersions();
        if (result.kind === "sales-price-table") {
          setActiveSalesTable(await window.halexDesktop.imports.activeSalesPriceTable());
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível importar a tabela.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function importMediconeProducts() {
    if (!window.halexDesktop)
      return setMessage(
        "A importação está disponível no aplicativo instalado.",
      );
    setBusy("products-medicone");
    setMessage("");
    try {
      const result = await window.halexDesktop.imports.productsMedicone();
      if (result) {
        setMessage(result.kind === "sales-price-table"
          ? `Medicone · ${result.fileName}: tabela ${result.period} ativada com ${result.imported} produtos, ${result.regions} regiões e ${result.categories} categorias${result.fallbackPrices ? `; ${result.fallbackPrices} preço(s) inválido(s) preenchido(s) pela região principal` : ""}.`
          : `Medicone · ${result.fileName}: catálogo importado com ${result.imported} produtos; ${result.ignored} linhas ignoradas.`);
        setActiveMediconeTable(await window.halexDesktop.imports.activeSalesPriceTableMedicone());
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível importar a tabela Medicone.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function activate(version: Version) {
    if (!window.halexDesktop || version.active) return;
    if (
      !window.confirm(
        `Ativar novamente a tabela ${version.name}? Os preços atuais serão substituídos.`,
      )
    )
      return;
    setBusy("version");
    try {
      const count = await window.halexDesktop.imports.activatePriceVersion(
        version.id,
      );
      setMessage(`${version.name} reativada com ${count} produtos.`);
      await loadVersions();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível trocar a tabela.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(version: Version) {
    if (!window.halexDesktop) return;
    const warning = version.active
      ? `Excluir a tabela ativa ${version.name}? A versão anterior mais recente será ativada automaticamente.`
      : `Excluir permanentemente a tabela ${version.name}?`;
    if (!window.confirm(warning)) return;
    setBusy("version");
    setMessage("");
    try {
      const result = await window.halexDesktop.imports.deletePriceVersion(
        version.id,
      );
      setMessage(
        result.activatedVersionId
          ? `${version.name} excluída. A tabela anterior foi reativada automaticamente.`
          : `${version.name} excluída.`,
      );
      await loadVersions();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a tabela.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Dados locais</p>
        <h1 className="mt-2">Importar clientes e tabelas</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Carregue arquivos Excel ou CSV. A tabela comercial mensal fica ativa
          nas cotações e os catálogos simples mantêm histórico de versões.
        </p>
      </header>
      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {message}
        </div>
      )}
      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass-card p-6">
          <div className="metric-icon">
            <Users size={18} />
          </div>
          <h2 className="mt-4 font-semibold">Clientes e histórico comercial</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Sincroniza pelo código do cliente. Registros existentes são
            atualizados; novos são adicionados; clientes ausentes ficam inativos
            sem perder cotações.
          </p>
          <p className="mt-3 text-xs text-stone-400">
            Colunas principais: código, cliente/razão social, CNPJ, cidade, UF,
            contato, telefone, e-mail, última compra, ciclo e próxima compra.
          </p>
          <button
            onClick={() => void importClients()}
            disabled={busy !== null}
            className="brand-button mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold"
          >
            <Upload size={15} />
            {busy === "clients"
              ? "Importando..."
              : "Selecionar Excel de clientes"}
          </button>
        </article>
        <article className="glass-card p-6">
          <div className="metric-icon">
            <FileSpreadsheet size={18} />
          </div>
          <h2 className="mt-4 font-semibold">Catálogo e tabela de preços</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Reconhece automaticamente a tabela mensal com regiões, categorias
            e preços dedicado/fracionado usados nas cotações.
          </p>
          <p className="mt-3 text-xs text-stone-400">
            Também aceita catálogo simples com código, produto, apresentação,
            fabricante, unidade e preço opcional.
          </p>
          <button
            onClick={() => void importProducts()}
            disabled={busy !== null}
            className="brand-button mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold"
          >
            <Upload size={15} />
            {busy === "products" ? "Importando..." : "Selecionar nova tabela"}
          </button>
        </article>
        <article className="glass-card p-6">
          <div className="metric-icon">
            <FileSpreadsheet size={18} />
          </div>
          <h2 className="mt-4 font-semibold">Tabela Medicone</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            Tabela comercial de material hospitalar da Medicone. Fica ativa em
            paralelo à Halex Istar — uma cotação pode conter as duas marcas.
          </p>
          <p className="mt-3 text-xs text-stone-400">
            Mesmo formato da tabela mensal (regiões, categorias e preços) ou
            catálogo simples. Os produtos entram marcados como Medicone.
          </p>
          <button
            onClick={() => void importMediconeProducts()}
            disabled={busy !== null}
            className="brand-button mt-5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold"
          >
            <Upload size={15} />
            {busy === "products-medicone" ? "Importando..." : "Selecionar tabela Medicone"}
          </button>
        </article>
      </section>
      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-100 p-5">
          <History size={17} className="text-amber-700" />
          <div>
            <h2 className="font-semibold">Histórico de tabelas</h2>
            <p className="mt-1 text-xs text-stone-500">
              Tabela mensal ativa e versões anteriores de catálogos simples.
            </p>
          </div>
        </div>
        {activeSalesTable && (
          <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-sm font-bold text-emerald-900">
              Tabela Halex Istar ativa · {activeSalesTable.period}
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              {activeSalesTable.name} · {activeSalesTable.products.length} produtos · {activeSalesTable.regions.length} regiões · {activeSalesTable.categories.length} categorias
            </p>
          </div>
        )}
        {activeMediconeTable && (
          <div className="border-b border-sky-200 bg-sky-50 px-5 py-4">
            <p className="text-sm font-bold text-sky-900">
              Tabela Medicone ativa · {activeMediconeTable.period}
            </p>
            <p className="mt-1 text-xs text-sky-800">
              {activeMediconeTable.name} · {activeMediconeTable.products.length} produtos · {activeMediconeTable.regions.length} regiões · {activeMediconeTable.categories.length} categorias
            </p>
          </div>
        )}
        {versions.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">
            Nenhuma tabela importada ainda.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {versions.map((version) => (
              <article
                key={version.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {version.name}
                    </p>
                    {Boolean(version.active) && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        ATIVA
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {version.row_count} linhas ·{" "}
                    {new Date(version.imported_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void activate(version)}
                    disabled={Boolean(version.active) || busy !== null}
                    className="brand-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold"
                  >
                    <RefreshCw size={14} />
                    {version.active ? "Em uso" : "Ativar esta tabela"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(version)}
                    disabled={busy !== null}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Excluir tabela ${version.name}`}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
