"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  FileCheck2,
  FileSpreadsheet,
  History,
  LoaderCircle,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  UploadCloud,
} from "lucide-react";
import { db, type AppDataBundle } from "@/lib/db";
import { parseBillingReportOcr } from "@/lib/billing-report-pdf";
import {
  normalizeHalexDocument,
  parseHalexInvoiceMatrix,
  type HalexInvoice,
  type HalexMatrixRow,
} from "@/lib/halex-bulk-empenho";

type DanfeDocument = Awaited<ReturnType<NonNullable<typeof window.halexDesktop>["billing"]["chooseDanfes"]>>[number];
type EmailHistory = Awaited<ReturnType<NonNullable<typeof window.halexDesktop>["billing"]["emailHistory"]>>[number];
type Draft = { to: string; subject: string; body: string };

function invoiceNumber(value: string) {
  return normalizeHalexDocument(value).replace(/^0+(?=\d)/, "");
}

function clientKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function defaultDraft(invoice: HalexInvoice, email = ""): Draft {
  const nf = invoiceNumber(invoice.nf);
  const salesOrder = invoice.numeroEmpenho.replace(/^OV\s*/i, "");
  const order = salesOrder ? ` referente à ordem de venda ${salesOrder}` : "";
  return {
    to: email,
    subject: `Nota fiscal ${nf} · ${invoice.nomeCliente || "Halex Istar"}`,
    body: [
      invoice.nomeCliente ? `Olá, equipe ${invoice.nomeCliente},` : "Olá,",
      "",
      `Informamos que a nota fiscal ${nf}${order} foi faturada.`,
      "O DANFE correspondente segue anexo para conferência.",
      "",
      "Permanecemos à disposição.",
    ].join("\n"),
  };
}

function shortDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

export default function BillingFollowUpPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<HalexInvoice[]>([]);
  const [fileName, setFileName] = useState("");
  const [documents, setDocuments] = useState<DanfeDocument[]>([]);
  const [appData, setAppData] = useState<AppDataBundle | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [history, setHistory] = useState<EmailHistory[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState("");
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    db.getAppData().then(setAppData).catch(() => {});
    window.halexDesktop?.billing.emailHistory().then(setHistory).catch(() => {});
  }, []);

  const emailByClient = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of appData?.licitacoes || []) {
      const code = invoiceNumber(item.codigo_cliente || "");
      if (code && item.orgao_email && !map.has(code)) map.set(code, item.orgao_email);
      const name = clientKey(item.orgao || "");
      if (name && item.orgao_email && !map.has(`NAME:${name}`)) map.set(`NAME:${name}`, item.orgao_email);
    }
    return map;
  }, [appData]);

  const documentByInvoice = useMemo(() => {
    const map = new Map<string, DanfeDocument>();
    for (const document of documents) {
      const nf = invoiceNumber(document.invoiceNumber);
      if (nf && document.token) map.set(nf, document);
    }
    return map;
  }, [documents]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter((record) => !needle || [
      record.nf,
      record.ordemVenda,
      record.codigoCliente,
      record.nomeCliente,
    ].join(" ").toLowerCase().includes(needle)).slice(0, 150);
  }, [records, search]);

  const matchedCount = records.filter((record) => documentByInvoice.has(invoiceNumber(record.nf))).length;

  function draftFor(record: HalexInvoice) {
    const key = record.key;
    return drafts[key] || defaultDraft(
      record,
      emailByClient.get(invoiceNumber(record.codigoCliente))
        || emailByClient.get(`NAME:${clientKey(record.nomeCliente)}`)
        || "",
    );
  }

  function updateDraft(record: HalexInvoice, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [record.key]: { ...draftFor(record), ...patch },
    }));
  }

  async function importSpreadsheet(file: File) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      let parsed: HalexInvoice[];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        if (!window.halexDesktop?.billing) throw new Error("A leitura OCR de PDF está disponível no aplicativo desktop.");
        const text = await window.halexDesktop.billing.parseReportPdf(await file.arrayBuffer());
        parsed = parseBillingReportOcr(text);
      } else {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false });
        const matrix = workbook.SheetNames.flatMap((name) =>
          XLSX.utils.sheet_to_json<HalexMatrixRow>(workbook.Sheets[name], {
            header: 1,
            defval: "",
            raw: true,
          }),
        );
        parsed = parseHalexInvoiceMatrix(matrix);
      }
      if (parsed.length === 0) throw new Error("Nenhuma NF foi encontrada no relatório detalhado da Halex.");
      setRecords(parsed);
      setFileName(file.name);
      setDrafts({});
      setNotice(`${parsed.length} NF(s) carregadas. Agora selecione os DANFEs.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ler a planilha.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function chooseDanfes() {
    if (!window.halexDesktop?.billing) {
      setError("A seleção e o envio de DANFEs estão disponíveis no aplicativo desktop.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const selected = await window.halexDesktop.billing.chooseDanfes();
      if (selected.length > 0) {
        setDocuments((current) => {
          const next = new Map(current.map((item) => [item.fileName, item]));
          selected.forEach((item) => next.set(item.fileName, item));
          return [...next.values()];
        });
        setNotice(`${selected.length} DANFE(s) processados.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível processar os DANFEs.");
    } finally {
      setUploading(false);
    }
  }

  async function sendEmail(record: HalexInvoice) {
    const draft = draftFor(record);
    const document = documentByInvoice.get(invoiceNumber(record.nf));
    if (!document?.token) return setError("Anexe o DANFE correspondente antes de enviar.");
    if (!draft.to) return setError("Informe o e-mail do cliente.");
    if (!window.confirm(`Enviar a NF ${invoiceNumber(record.nf)} para ${draft.to}?`)) return;
    setSending(record.key);
    setError("");
    setNotice("");
    try {
      const sent = await window.halexDesktop!.billing.sendEmail({
        ...draft,
        attachmentTokens: [document.token],
        invoiceNumbers: [invoiceNumber(record.nf)],
      });
      setHistory((current) => [sent, ...current]);
      setNotice(`E-mail da NF ${invoiceNumber(record.nf)} enviado para ${draft.to}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "O envio falhou.");
    } finally {
      setSending("");
    }
  }

  async function copyInvoiceNumbers() {
    await navigator.clipboard.writeText(records.map((record) => invoiceNumber(record.nf)).join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5 pb-16">
      <header className="page-hero">
        <p className="lumina-kicker">Pós-venda</p>
        <h1 className="mt-2">Faturamento e envio de DANFE</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          Importe o relatório Halex, associe os DANFEs às notas e envie cada documento ao cliente pelo Gmail configurado.
        </p>
      </header>

      {(error || notice) && (
        <div className={`rounded-lg border p-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error || notice}
        </div>
      )}

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="glass-card flex items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="metric-icon"><FileSpreadsheet size={18} /></span>
            <div className="min-w-0">
              <h2 className="font-semibold">1. Relatório de faturamento</h2>
              <p className="mt-1 truncate text-xs text-stone-500">{fileName || "PDF, XLSX, XLS ou CSV da Halex"}</p>
            </div>
          </div>
          <button type="button" disabled={loading} onClick={() => inputRef.current?.click()} className="brand-button inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-bold">
            {loading ? <RefreshCw className="animate-spin" size={15} /> : <UploadCloud size={15} />}
            {records.length ? "Trocar" : "Selecionar"}
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSpreadsheet(file); }} />
        </div>

        <div className="glass-card flex items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="metric-icon"><Paperclip size={18} /></span>
            <div>
              <h2 className="font-semibold">2. DANFEs em lote</h2>
              <p className="mt-1 text-xs text-stone-500">{documents.length} PDF(s) · {matchedCount} correspondência(s)</p>
            </div>
          </div>
          <button type="button" disabled={uploading} onClick={() => void chooseDanfes()} className="brand-secondary inline-flex shrink-0 items-center gap-2 px-3 py-2 text-xs font-bold">
            {uploading ? <LoaderCircle className="animate-spin" size={15} /> : <FileCheck2 size={15} />}
            Selecionar PDFs
          </button>
        </div>
      </section>

      {records.length > 0 && (
        <>
          <section className="metric-strip grid grid-cols-2 md:grid-cols-4">
            {[["NFs no relatório", records.length], ["DANFEs lidos", documents.length], ["Prontos para envio", matchedCount], ["Enviados nesta base", history.length]].map(([label, value]) => (
              <div key={String(label)} className="metric-item p-4"><p className="text-[10px] font-bold uppercase text-stone-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
            ))}
          </section>

          <section className="glass-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-semibold">3. Conferir e enviar</h2><p className="mt-1 text-xs text-stone-500">Revise destinatário e mensagem antes de cada envio.</p></div>
              <div className="flex gap-2">
                <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="NF, pedido ou cliente" className="form-input w-60 pl-9 text-xs" /></div>
                <button type="button" onClick={() => void copyInvoiceNumbers()} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copiado" : "Copiar NFs"}</button>
              </div>
            </div>

            <div className="divide-y divide-stone-200">
              {visible.map((record) => {
                const nf = invoiceNumber(record.nf);
                const document = documentByInvoice.get(nf);
                const draft = draftFor(record);
                const sent = history.some((item) => item.invoiceNumbers.includes(nf));
                return (
                  <article key={record.key} className="grid gap-4 p-4 xl:grid-cols-[260px_minmax(0,1fr)_180px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><strong>NF {nf}</strong>{sent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Enviada</span>}</div>
                      <p className="mt-1 text-xs font-semibold text-stone-700">{record.nomeCliente || `Cliente ${record.codigoCliente}`}</p>
                      <p className="mt-1 text-[11px] text-stone-500">OV {record.numeroEmpenho.replace(/^OV\s*/i, "")} · SAP {record.ordemVenda || "—"} · Faturamento {shortDate(record.dataFaturamento)}</p>
                      {(() => {
                        if (!document?.token) {
                          return (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                              <AlertTriangle className="mr-1 inline" size={13} />DANFE não encontrado
                            </div>
                          );
                        }
                        // A match built from the filename (no valid access key) carries a
                        // warning — surface it so it isn't mistaken for a confident match.
                        const warning = document.issues?.[0];
                        return (
                          <div className={`mt-3 rounded-lg border p-2 text-[11px] ${warning ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                            {warning ? <AlertTriangle className="mr-1 inline" size={13} /> : <FileCheck2 className="mr-1 inline" size={13} />}
                            {document.fileName}
                            {warning && <span className="mt-1 block">{warning}</span>}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="grid gap-2">
                      <input type="email" aria-label={`Destinatário da NF ${nf}`} value={draft.to} onChange={(event) => updateDraft(record, { to: event.target.value })} placeholder="E-mail do cliente" className="form-input w-full text-xs" />
                      <input aria-label={`Assunto da NF ${nf}`} value={draft.subject} onChange={(event) => updateDraft(record, { subject: event.target.value })} className="form-input w-full text-xs font-semibold" />
                      <textarea aria-label={`Mensagem da NF ${nf}`} rows={4} value={draft.body} onChange={(event) => updateDraft(record, { body: event.target.value })} className="form-input w-full resize-y p-3 text-xs leading-5" />
                    </div>
                    <div className="flex flex-col justify-between gap-3">
                      <div className="rounded-lg bg-stone-50 p-3 text-[11px] text-stone-600"><strong>{record.items.length} item(ns)</strong><p className="mt-1">O texto é editável para indicar faturamento parcial quando necessário.</p></div>
                      <button type="button" disabled={!document?.token || !draft.to || sending === record.key} onClick={() => void sendEmail(record)} className="brand-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">
                        {sending === record.key ? <LoaderCircle className="animate-spin" size={14} /> : <Send size={14} />}{sending === record.key ? "Enviando..." : sent ? "Enviar novamente" : "Enviar e-mail"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {records.length > 150 && <p className="border-t border-stone-200 p-3 text-center text-xs text-stone-500">Mostrando até 150 registros. Use a busca para localizar outras NFs.</p>}
          </section>
        </>
      )}

      <section className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-200 p-4"><History size={16} className="text-amber-700" /><h2 className="font-semibold">Histórico de envios</h2></div>
        {history.length === 0 ? <p className="p-5 text-sm text-stone-500">Nenhum DANFE enviado por este aplicativo.</p> : <div className="divide-y divide-stone-100">{history.slice(0, 30).map((item) => <div key={item.id} className="grid gap-2 p-4 text-xs sm:grid-cols-[150px_1fr_auto]"><span className="text-stone-500">{new Date(item.sentAt).toLocaleString("pt-BR")}</span><span><Mail className="mr-1 inline" size={13} />{item.to} · {item.subject}</span><strong className="text-emerald-700">NF {item.invoiceNumbers.join(", ")}</strong></div>)}</div>}
      </section>
    </div>
  );
}
