"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clipboard,
  Check,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  History,
  Phone,
  RefreshCw,
  Search,
  TrendingDown,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { appDate, money } from "@/lib/crm-preview";
import { localIsoDate } from "@/lib/date";
import { clientIdentityLabel } from "@/lib/client-duplicates";
import { isCnpjBaixado } from "@/lib/client-contact-sources";
import {
  countBySegment,
  parseSalesMatrix,
  SALES_SEGMENTS,
  summarizeClientSales,
  unknownSalesClients,
  type SalesMatrixRow,
  type SalesRow,
  type SalesSegment,
} from "@/lib/sales-history";
import { buildReactivationSheets } from "@/lib/reactivation-export";
import { notifyCrmDataChanged, useDesktopClients } from "@/lib/use-desktop-data";

const SEGMENT_TONE: Record<string, string> = {
  ativo: "border-emerald-200 bg-emerald-50 text-emerald-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-800",
  frio: "border-orange-200 bg-orange-50 text-orange-800",
  perdido: "border-red-200 bg-red-50 text-red-700",
  dormente: "border-stone-300 bg-stone-100 text-stone-700",
  sem_compra: "border-stone-200 bg-stone-50 text-stone-500",
};

const FILTER_OPTIONS: Array<{ value: SalesSegment | "todos" | "reconquista"; label: string }> = [
  { value: "reconquista", label: "Para reconquistar (3 meses ou mais)" },
  { value: "todos", label: "Todos os clientes" },
  ...SALES_SEGMENTS.map((item) => ({ value: item.value as SalesSegment, label: item.label })),
  { value: "sem_compra", label: "Sem compra no relatório" },
];

const RECONQUEST_SEGMENTS = new Set<SalesSegment>(["atencao", "frio", "perdido", "dormente"]);

export default function ReactivationPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clients = useDesktopClients();
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [lastImport, setLastImport] = useState<Awaited<ReturnType<NonNullable<typeof window.halexDesktop>["clients"]["lastSalesImport"]>>>(null);
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]["value"]>("reconquista");
  const [includeOrgaoPublico, setIncludeOrgaoPublico] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState<Record<string, boolean>>({});
  const [exported, setExported] = useState("");

  useEffect(() => {
    window.halexDesktop?.clients.lastSalesImport().then(setLastImport).catch(() => {});
  }, []);

  const today = localIsoDate();
  const summaries = useMemo(
    () => summarizeClientSales(clients, rows, { today, includeOrgaoPublico }),
    [clients, rows, today, includeOrgaoPublico],
  );
  const counts = useMemo(() => countBySegment(summaries), [summaries]);
  const unknown = useMemo(() => unknownSalesClients(clients, rows), [clients, rows]);
  const isRegistering = (key: string) => registering[key] ?? true;
  const selectedUnknown = unknown.filter((item) => isRegistering(item.code || item.cnpj || item.name));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return summaries.filter((summary) => {
      const matchesFilter = filter === "todos"
        || (filter === "reconquista"
          ? RECONQUEST_SEGMENTS.has(summary.segment)
          : summary.segment === filter);
      const matchesQuery = !needle
        || `${summary.client.name} ${summary.client.code} ${summary.client.city}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [summaries, filter, query]);

  async function importReport(file: File) {
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const matrix = workbook.SheetNames.flatMap((name) =>
        XLSX.utils.sheet_to_json<SalesMatrixRow>(workbook.Sheets[name], {
          header: 1,
          defval: "",
          raw: true,
        }));

      const parsed = parseSalesMatrix(matrix);
      if (parsed.rows.length === 0) {
        throw new Error("Não encontrei colunas de data e cliente no relatório. Confira se o arquivo tem cabeçalho.");
      }
      setRows(parsed.rows);
      setFileName(file.name);

      // The history is saved so the agenda, o dashboard e as próximas aberturas
      // desta tela já venham com os dados sem reimportar.
      if (window.halexDesktop?.clients.importSales) {
        const saved = await window.halexDesktop.clients.importSales(parsed.rows.map((row) => ({
          clientCode: row.clientCode,
          cnpj: row.cnpj,
          date: row.date,
          document: row.document,
          value: row.value,
        })));
        setLastImport({ importedAt: new Date().toISOString(), ...saved });
        notifyCrmDataChanged();
        setNotice(
          `${parsed.rows.length} linha(s) lidas · ${saved.purchases} compra(s) gravadas em ${saved.clients} cliente(s)`
          + `${saved.unmatched ? ` · ${saved.unmatched} linha(s) de clientes fora do cadastro` : ""}.`,
        );
      } else {
        setNotice(`${parsed.rows.length} linha(s) lidas. A gravação do histórico está disponível no aplicativo desktop.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o relatório.");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /**
   * Creates the cadastro of the clients that only existed in the relatório and
   * re-imports, so their purchase history lands on the new cadastros.
   */
  async function registerUnknown() {
    if (!window.halexDesktop || selectedUnknown.length === 0) return;
    setBusy("register");
    setError("");
    try {
      let created = 0;
      for (const item of selectedUnknown) {
        if (!item.name) continue;
        await window.halexDesktop.clients.save({
          code: item.code,
          name: item.name,
          document: item.cnpj || undefined,
          status: "active",
        });
        created += 1;
      }
      const saved = await window.halexDesktop.clients.importSales(rows.map((row) => ({
        clientCode: row.clientCode,
        cnpj: row.cnpj,
        date: row.date,
        document: row.document,
        value: row.value,
      })));
      setLastImport({ importedAt: new Date().toISOString(), ...saved });
      notifyCrmDataChanged();
      setNotice(`${created} cliente(s) cadastrado(s) e histórico revinculado · ${saved.unmatched} linha(s) ainda fora do cadastro.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar os clientes.");
    } finally {
      setBusy("");
    }
  }

  /**
   * Exports what the filter is showing: one aba per carteira, with the column
   * the vendedor marks SIM / NÃO / TALVEZ.
   */
  async function exportByCarteira() {
    if (!window.halexDesktop) {
      setError("A exportação em planilha está disponível no aplicativo desktop.");
      return;
    }
    setBusy("export");
    setError("");
    setNotice("");
    try {
      const sheets = buildReactivationSheets(visible);
      const saved = await window.halexDesktop.clients.exportReactivation(
        sheets.map((sheet) => ({
          carteira: sheet.carteira,
          total: sheet.total,
          rows: sheet.rows as unknown as Array<Record<string, string | number>>,
        })),
      );
      if (!saved) return;
      setExported(saved.filePath);
      setNotice(
        `Planilha salva: ${saved.sheets.map((sheet) => `${sheet.carteira} (${sheet.clients})`).join(" · ")}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível exportar a planilha.");
    } finally {
      setBusy("");
    }
  }

  async function copyList() {
    const text = visible
      .map((item) => [
        item.client.code,
        item.client.name,
        item.client.phone || "",
        item.client.email || "",
        item.lastPurchase || "sem compra",
        item.orders,
        item.total.toFixed(2),
      ].join("\t"))
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5 pb-16">
      <header className="page-hero">
        <p className="lumina-kicker">Comercial</p>
        <h1 className="mt-2">Reativação de clientes</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Importe o relatório de vendas e veja quem está comprando, quem sumiu há três meses, seis meses ou anos. Órgão público fica de fora por padrão.
        </p>
      </header>

      {exported && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="min-w-0 truncate font-semibold">Planilha gerada em {exported}</span>
          <button type="button" onClick={() => void window.halexDesktop?.clients.revealFile(exported)} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
            <FolderOpen size={14} />
            Abrir pasta
          </button>
        </div>
      )}

      {(error || notice) && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error || notice}
        </div>
      )}

      <section className="glass-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="metric-icon"><UploadCloud size={18} /></span>
          <div className="min-w-0">
            <h2 className="font-semibold">Relatório de vendas</h2>
            <p className="mt-1 truncate text-xs text-stone-500">
              {fileName || "XLSX, XLS ou CSV com data, cliente e valor"}
              {lastImport && !fileName ? ` · última importação em ${appDate(lastImport.importedAt.slice(0, 10))}: ${lastImport.purchases} compras` : ""}
            </p>
          </div>
        </div>
        <button type="button" disabled={busy !== ""} onClick={() => inputRef.current?.click()} className="brand-button inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-bold">
          {busy === "import" ? <RefreshCw className="animate-spin" size={15} /> : <UploadCloud size={15} />}
          {rows.length ? "Trocar relatório" : "Selecionar relatório"}
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importReport(file);
        }} />
      </section>

      {rows.length > 0 && (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { value: "todos" as const, label: "Clientes no cadastro", count: summaries.length, tone: "border-stone-200 bg-white text-stone-700" },
              ...SALES_SEGMENTS.map((segment) => ({
                value: segment.value as SalesSegment,
                label: segment.label,
                count: counts.get(segment.value) || 0,
                tone: SEGMENT_TONE[segment.value],
              })),
              { value: "sem_compra" as const, label: "Sem compra no relatório", count: counts.get("sem_compra") || 0, tone: SEGMENT_TONE.sem_compra },
            ].map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => setFilter(card.value)}
                className={`rounded-lg border p-4 text-left transition ${card.tone} ${filter === card.value ? "ring-2 ring-amber-500" : ""}`}
              >
                <p className="text-[10px] font-bold uppercase leading-tight">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold">{card.count}</p>
              </button>
            ))}
          </section>

          <section className="glass-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Filtrar por situação de compra" className="form-input text-xs" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                  {FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                  <input type="checkbox" checked={includeOrgaoPublico} onChange={(event) => setIncludeOrgaoPublico(event.target.checked)} />
                  Incluir órgão público
                </label>
                <span className="text-xs font-semibold text-stone-500">{visible.length} cliente(s)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, código ou cidade" className="form-input input-with-icon w-56 text-xs" />
                </div>
                <button type="button" onClick={() => void copyList()} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied ? "Copiado" : "Copiar lista"}
                </button>
                <button type="button" disabled={busy !== "" || visible.length === 0} onClick={() => void exportByCarteira()} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-40">
                  {busy === "export" ? <RefreshCw className="animate-spin" size={14} /> : <FileSpreadsheet size={14} />}
                  Exportar por carteira
                </button>
              </div>
            </div>

            <div className="divide-y divide-stone-100">
              {visible.slice(0, 200).map((summary) => {
                const identity = clientIdentityLabel(summary.client);
                const segment = SALES_SEGMENTS.find((item) => item.value === summary.segment);
                return (
                  <article key={summary.client.id} className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_320px_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm">{summary.client.name}</strong>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${SEGMENT_TONE[summary.segment]}`}>
                          {segment?.label || "Sem compra no relatório"}
                        </span>
                        {summary.overdue && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            <TrendingDown className="mr-1 inline" size={11} />
                            fora do ciclo de {summary.averageIntervalDays} dias
                          </span>
                        )}
                        {isCnpjBaixado(summary.client) && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-800">CNPJ baixado</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-stone-600">{identity.code} · {identity.cnpj}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        {summary.client.city}/{summary.client.state}
                        {summary.client.phone ? ` · ${summary.client.phone}` : ""}
                        {summary.client.email ? ` · ${summary.client.email}` : " · sem e-mail"}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 xl:grid-cols-2">
                      <div>
                        <dt className="text-stone-400">Última compra</dt>
                        <dd className="mt-0.5 font-bold">
                          {summary.lastPurchase ? appDate(summary.lastPurchase) : "—"}
                          {summary.orders > 0 && Number.isFinite(summary.daysSinceLast) && (
                            <span className="ml-1 font-normal text-stone-500">({summary.daysSinceLast}d)</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-400">Compras</dt>
                        <dd className="mt-0.5 font-bold">{summary.orders}</dd>
                      </div>
                      <div>
                        <dt className="text-stone-400">Total no período</dt>
                        <dd className="mt-0.5 font-bold">{money(summary.total)}</dd>
                      </div>
                      <div>
                        <dt className="text-stone-400">Últimos 12 meses</dt>
                        <dd className="mt-0.5 font-bold">{money(summary.total12m)}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap gap-2">
                      {summary.client.phone && (
                        <a href={`tel:${summary.client.phone.replace(/\D/g, "")}`} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
                          <Phone size={14} />
                          Ligar
                        </a>
                      )}
                      <Link href={`/dashboard/cotacoes/nova?cliente=${summary.client.id}`} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
                        <FilePlus2 size={14} />
                        Cotar
                      </Link>
                    </div>
                  </article>
                );
              })}
              {visible.length === 0 && (
                <p className="p-6 text-sm text-stone-500">Nenhum cliente neste filtro.</p>
              )}
            </div>
            {visible.length > 200 && (
              <p className="border-t border-stone-200 p-3 text-center text-xs text-stone-500">
                Mostrando 200 de {visible.length} clientes. Use a busca para chegar nos demais.
              </p>
            )}
          </section>
        </>
      )}

      {unknown.length > 0 && (
        <section className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={17} className="text-amber-700" />
                Compraram, mas não estão no cadastro
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                {unknown.length} cliente(s) do relatório sem cadastro na carteira, somando {money(unknown.reduce((sum, item) => sum + item.total, 0))}. Cadastre para que entrem na análise e no acompanhamento.
              </p>
            </div>
            <button type="button" disabled={busy !== "" || selectedUnknown.length === 0} onClick={() => void registerUnknown()} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:opacity-40">
              {busy === "register" ? <RefreshCw className="animate-spin" size={14} /> : <UserPlus size={14} />}
              Cadastrar {selectedUnknown.length} cliente(s)
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
            {unknown.slice(0, 200).map((item) => {
              const key = item.code || item.cnpj || item.name;
              return (
                <li key={key} className="p-3 text-xs">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isRegistering(key)}
                      disabled={!item.name}
                      onChange={(event) => setRegistering((current) => ({ ...current, [key]: event.target.checked }))}
                      aria-label={`Cadastrar ${item.name || item.code}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.name || `Cliente ${item.code || item.cnpj}`}</span>
                      <span className="mt-0.5 block text-stone-500">
                        Código {item.code || "—"}
                        {item.cnpj ? ` · CNPJ ${item.cnpj}` : ""}
                        {" · "}{item.orders} compra(s) · {money(item.total)} · última em {appDate(item.lastPurchase)}
                        {!item.name ? " · sem nome no relatório, cadastre manualmente" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {unknown.length > 200 && (
            <p className="border-t border-stone-200 p-3 text-center text-xs text-stone-500">Mostrando 200 de {unknown.length}.</p>
          )}
        </section>
      )}

      {rows.length === 0 && (
        <section className="glass-card p-6 text-sm text-stone-500">
          <p className="flex items-center gap-2 font-semibold text-stone-700">
            <History size={16} className="text-amber-700" />
            Como usar
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs">
            <li>Baixe o relatório de vendas do período que quiser analisar — quanto maior, melhor a leitura do ciclo de cada cliente.</li>
            <li>Selecione o arquivo acima. As colunas de data, cliente e valor são reconhecidas automaticamente.</li>
            <li>O histórico é gravado no cadastro: última compra, ciclo médio e previsão passam a alimentar a agenda e o painel.</li>
          </ol>
          <p className="mt-3 flex items-start gap-2 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" />
            Uma nova importação substitui o histórico anterior de cada cliente presente no arquivo, então importe sempre o relatório completo do período.
          </p>
        </section>
      )}
    </div>
  );
}
