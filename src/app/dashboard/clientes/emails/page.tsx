"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Mail, MailSearch, Save, ShieldCheck } from "lucide-react";
import {
  DEFAULT_INTERNAL_DOMAINS,
  matchContacts,
  type ContactSuggestion,
  type MailboxContact,
} from "@/lib/client-contact-match";
import { clientIdentityLabel } from "@/lib/client-duplicates";
import { notifyCrmDataChanged, useDesktopClients } from "@/lib/use-desktop-data";
import { useAppUX } from "@/components/AppUX";

type Mailbox = Awaited<ReturnType<NonNullable<typeof window.halexDesktop>["contacts"]["getMailbox"]>>;

const CONFIDENCE_TONE: Record<ContactSuggestion["confidence"], string> = {
  alta: "border-emerald-200 bg-emerald-50 text-emerald-800",
  media: "border-amber-200 bg-amber-50 text-amber-800",
  baixa: "border-stone-200 bg-stone-50 text-stone-600",
};

export default function ClientEmailsPage() {
  const clients = useDesktopClients();
  const { toast } = useAppUX();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [password, setPassword] = useState("");
  const [contacts, setContacts] = useState<MailboxContact[]>([]);
  const [scanNote, setScanNote] = useState("");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    window.halexDesktop?.contacts.getMailbox().then(setMailbox).catch(() => {});
  }, []);

  const { suggestions, discarded } = useMemo(
    () => matchContacts(clients, contacts, {
      // The mailbox's own domain is ours by definition.
      internalDomains: [...(mailbox?.internalDomains || []), mailbox?.email.split("@")[1] || ""],
    }),
    [clients, contacts, mailbox],
  );
  const missingCount = clients.filter((client) => !client.email?.trim()).length;
  // Only high confidence starts checked; média and baixa need a human look.
  const isAccepted = (id: string, confidence: ContactSuggestion["confidence"]) =>
    accepted[id] ?? confidence === "alta";
  const acceptedSuggestions = suggestions.filter((item) => isAccepted(item.client.id, item.confidence));

  function updateMailbox(patch: Partial<Mailbox>) {
    setMailbox((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveMailbox() {
    if (!mailbox || !window.halexDesktop) return;
    setBusy("save");
    setError("");
    try {
      await window.halexDesktop.contacts.saveMailbox({
        provider: mailbox.provider,
        email: mailbox.email,
        password: password || undefined,
        internalDomains: (mailbox.internalDomains || []).join(", "),
        host: mailbox.host || mailbox.presets[mailbox.provider]?.host,
        port: mailbox.port,
        months: mailbox.months,
      });
      setPassword("");
      setMailbox(await window.halexDesktop.contacts.getMailbox());
      toast("Caixa de e-mails salva.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a caixa.");
    } finally {
      setBusy("");
    }
  }

  async function scan() {
    if (!window.halexDesktop) return;
    setBusy("scan");
    setError("");
    setScanNote("");
    try {
      const result = await window.halexDesktop.contacts.scan();
      setContacts(result.contacts);
      setAccepted({});
      setScanNote(
        `${result.contacts.length} endereço(s) em ${result.messages} mensagem(ns) de ${result.folders.join(", ")}, desde ${result.since}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler a caixa de e-mails.");
    } finally {
      setBusy("");
    }
  }

  async function applyAccepted() {
    if (!window.halexDesktop || acceptedSuggestions.length === 0) return;
    setBusy("apply");
    setError("");
    let saved = 0;
    try {
      for (const suggestion of acceptedSuggestions) {
        await window.halexDesktop.clients.save({
          id: suggestion.client.id,
          name: suggestion.client.name,
          code: suggestion.client.code,
          email: suggestion.contact.address,
        });
        saved += 1;
      }
      notifyCrmDataChanged();
      toast(`${saved} e-mail(s) gravado(s) no cadastro.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gravar os e-mails.");
    } finally {
      setBusy("");
    }
  }

  const preset = mailbox?.presets?.[mailbox.provider];

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">CRM</p>
        <h1 className="mt-2">Buscar e-mails dos clientes</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-500">
          O aplicativo lê a sua caixa por IMAP, apenas os remetentes e destinatários das mensagens, e propõe o endereço de cada cliente pelo nome. Nada é gravado sem a sua confirmação.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/clientes" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
          <ArrowLeft size={14} />
          Voltar para a carteira
        </Link>
        <span className="text-xs font-semibold text-stone-500">{missingCount} cliente(s) sem e-mail no cadastro</span>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

      <section className="glass-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Mail size={17} className="text-amber-700" /> 1. Caixa de e-mails</h2>
        {!mailbox ? (
          <p className="mt-3 text-sm text-stone-500">A leitura da caixa está disponível no aplicativo desktop.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold text-stone-500">
                Provedor
                <select className="form-input mt-1 w-full text-sm" value={mailbox.provider} onChange={(event) => {
                  const provider = event.target.value;
                  const next = mailbox.presets[provider];
                  updateMailbox({ provider, host: next?.host || "", port: next?.port || 993 });
                }}>
                  {Object.entries(mailbox.presets).map(([value, item]) => (
                    <option key={value} value={value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-stone-500">
                E-mail
                <input type="email" className="form-input mt-1 w-full text-sm" value={mailbox.email} onChange={(event) => updateMailbox({ email: event.target.value })} placeholder="voce@yahoo.com" />
              </label>
              <label className="text-xs font-bold text-stone-500">
                Senha de aplicativo
                <input type="password" className="form-input mt-1 w-full text-sm" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mailbox.hasPassword ? "•••••••• (salva)" : "senha de aplicativo"} />
              </label>
              <label className="text-xs font-bold text-stone-500 md:col-span-2">
                Domínios internos (nunca viram contato de cliente)
                <input className="form-input mt-1 w-full text-sm" value={(mailbox.internalDomains || []).join(", ")} onChange={(event) => updateMailbox({ internalDomains: event.target.value.split(/[\s,;]+/).filter(Boolean) })} placeholder={DEFAULT_INTERNAL_DOMAINS.join(", ")} />
              </label>
              <label className="text-xs font-bold text-stone-500">
                Período (meses)
                <input type="number" min={1} max={60} className="form-input mt-1 w-full text-sm" value={mailbox.months} onChange={(event) => updateMailbox({ months: Number(event.target.value) })} />
              </label>
            </div>
            <p className="mt-3 text-[11px] text-stone-500">
              Servidor {mailbox.host || preset?.host} · porta {mailbox.port}. A senha fica criptografada nesta máquina pelo Windows e nunca sai do aplicativo. No Yahoo, gere uma senha de aplicativo em Configurações da conta &gt; Segurança.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy !== ""} onClick={() => void saveMailbox()} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
                {busy === "save" ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}
                Salvar caixa
              </button>
              <button type="button" disabled={busy !== "" || !mailbox.hasPassword} onClick={() => void scan()} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">
                {busy === "scan" ? <LoaderCircle className="animate-spin" size={14} /> : <MailSearch size={14} />}
                {busy === "scan" ? "Lendo a caixa..." : "Buscar contatos"}
              </button>
            </div>
            {scanNote && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{scanNote}</p>}
          </>
        )}
      </section>

      {contacts.length > 0 && (
        <section className="glass-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div>
              <h2 className="font-semibold">2. Conferir e gravar</h2>
              <p className="mt-1 text-xs text-stone-500">{suggestions.length} sugestão(ões) · {acceptedSuggestions.length} marcada(s) para gravar</p>
            </div>
            <button type="button" disabled={busy !== "" || acceptedSuggestions.length === 0} onClick={() => void applyAccepted()} className="brand-button inline-flex items-center gap-2 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">
              {busy === "apply" ? <LoaderCircle className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
              Gravar {acceptedSuggestions.length} e-mail(s)
            </button>
          </div>

          {discarded.length > 0 && (
            <p className="border-b border-stone-100 bg-stone-50 p-3 text-[11px] text-stone-600">
              {discarded.length} endereço(s) descartado(s): {discarded.slice(0, 6).map((item) => `${item.address} (${item.reason}${item.clients ? `, ${item.clients} clientes` : ""})`).join(" · ")}
              {discarded.length > 6 ? " …" : ""}
            </p>
          )}
          {suggestions.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">Nenhum endereço da caixa pôde ser associado com segurança a um cliente sem e-mail.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {suggestions.map((suggestion) => {
                const identity = clientIdentityLabel(suggestion.client);
                return (
                  <label key={suggestion.client.id} className="flex items-start gap-3 p-4">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isAccepted(suggestion.client.id, suggestion.confidence)}
                      onChange={(event) => setAccepted((current) => ({ ...current, [suggestion.client.id]: event.target.checked }))}
                      aria-label={`Gravar ${suggestion.contact.address} em ${suggestion.client.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm">{suggestion.client.name}</strong>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${CONFIDENCE_TONE[suggestion.confidence]}`}>
                          confiança {suggestion.confidence}
                        </span>
                      </span>
                      <span className="mt-1 block text-[11px] font-bold text-stone-600">{identity.code} · {identity.cnpj}</span>
                      <span className="mt-2 block text-sm font-semibold text-amber-800">{suggestion.contact.address}</span>
                      <span className="mt-1 block text-[11px] text-stone-500">
                        {suggestion.evidence} · {suggestion.contact.messages} mensagem(ns)
                        {suggestion.contact.name ? ` · "${suggestion.contact.name}"` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
