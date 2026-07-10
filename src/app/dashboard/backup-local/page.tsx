"use client";

import { useState } from "react";
import { ArchiveRestore, CheckCircle2, DatabaseBackup, HardDrive, ShieldCheck } from "lucide-react";
import { useAppUX } from "@/components/AppUX";

export default function LocalBackupPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, toast } = useAppUX();
  const lastBackup = typeof window === "undefined" ? null : localStorage.getItem("lastSuccessfulBackup");

  async function createBackup() {
    if (!window.halexDesktop) return setMessage("Backup nativo disponível no aplicativo instalado.");
    setBusy(true);
    try {
      const file = await window.halexDesktop.backup.create();
      if (file) {
        const now = new Date().toISOString();
        localStorage.setItem("lastSuccessfulBackup", now);
        setMessage(`Backup criado: ${file}`);
        toast("Backup criado com sucesso.");
      }
    } catch { toast("Não foi possível criar o backup.", "error"); }
    finally { setBusy(false); }
  }

  async function restoreBackup() {
    if (!window.halexDesktop) return setMessage("Restauração nativa disponível no aplicativo instalado.");
    if (!await confirm({ title: "Restaurar um backup?", description: "Os dados locais atuais serão substituídos. Crie um backup atual antes de continuar se precisar preservá-los.", confirmLabel: "Selecionar e restaurar", destructive: true })) return;
    setBusy(true);
    try {
      if (await window.halexDesktop.backup.restore()) {
        setMessage("Backup restaurado. Reinicie o aplicativo para carregar todos os dados.");
        toast("Backup restaurado com sucesso.");
      }
    } catch { toast("O arquivo não pôde ser restaurado.", "error"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <header className="page-hero"><p className="lumina-kicker">Segurança local</p><h1 className="mt-2">Backup dos dados</h1><p className="mt-2 text-sm text-stone-500">Proteja e transfira o banco SQLite completo entre computadores.</p></header>
    <section className="glass-panel flex items-center gap-4 p-4"><div className="metric-icon"><ShieldCheck size={18}/></div><div><p className="text-xs font-bold uppercase text-stone-400">Último backup confirmado</p><p className="mt-1 text-sm font-semibold">{lastBackup ? new Date(lastBackup).toLocaleString("pt-BR") : "Nenhum backup registrado neste computador"}</p></div>{lastBackup && <CheckCircle2 className="ml-auto text-emerald-600" size={20}/>}</section>
    {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800" role="status">{message}</div>}
    <section className="grid gap-4 md:grid-cols-2">
      <article className="glass-card p-6"><div className="metric-icon"><DatabaseBackup size={18}/></div><h2 className="mt-4 font-semibold">Criar backup</h2><p className="mt-2 text-sm text-stone-500">Salva clientes, produtos, contatos, compras, cotações e configurações em um arquivo.</p><button disabled={busy} onClick={() => void createBackup()} className="brand-button mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"><HardDrive size={16}/>{busy ? "Processando…" : "Escolher destino"}</button></article>
      <article className="glass-card p-6"><div className="metric-icon"><ArchiveRestore size={18}/></div><h2 className="mt-4 font-semibold">Restaurar backup</h2><p className="mt-2 text-sm text-stone-500">Use um arquivo de backup para recuperar ou mover a operação para outro computador.</p><button disabled={busy} onClick={() => void restoreBackup()} className="brand-secondary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"><ArchiveRestore size={16}/>Selecionar backup</button></article>
    </section>
  </div>;
}
