"use client";

import { useState } from "react";
import { ArchiveRestore, DatabaseBackup, HardDrive } from "lucide-react";

export default function LocalBackupPage() {
  const [message, setMessage] = useState("");
  async function createBackup() {
    if (!window.halexDesktop)
      return setMessage("Backup nativo disponível no aplicativo instalado.");
    const file = await window.halexDesktop.backup.create();
    if (file) setMessage(`Backup criado: ${file}`);
  }
  async function restoreBackup() {
    if (!window.halexDesktop)
      return setMessage(
        "Restauração nativa disponível no aplicativo instalado.",
      );
    if (
      !window.confirm(
        "Restaurar este backup substituirá os dados locais atuais. Continuar?",
      )
    )
      return;
    if (await window.halexDesktop.backup.restore())
      setMessage("Backup restaurado. Reabra a tela para atualizar os dados.");
  }
  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Segurança local</p>
        <h1 className="mt-2">Backup dos dados</h1>
        <p className="mt-2 text-sm text-stone-500">
          Proteja e transfira o banco SQLite completo entre computadores.
        </p>
      </header>
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      )}
      <section className="grid gap-4 md:grid-cols-2">
        <article className="glass-card p-6">
          <div className="metric-icon">
            <DatabaseBackup size={18} />
          </div>
          <h2 className="mt-4 font-semibold">Criar backup</h2>
          <p className="mt-2 text-sm text-stone-500">
            Salva clientes, produtos, contatos, compras, cotações e
            configurações em um arquivo.
          </p>
          <button
            onClick={() => void createBackup()}
            className="brand-button mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
          >
            <HardDrive size={16} />
            Escolher destino
          </button>
        </article>
        <article className="glass-card p-6">
          <div className="metric-icon">
            <ArchiveRestore size={18} />
          </div>
          <h2 className="mt-4 font-semibold">Restaurar backup</h2>
          <p className="mt-2 text-sm text-stone-500">
            Use um arquivo de backup para recuperar ou mover a operação para
            outro computador.
          </p>
          <button
            onClick={() => void restoreBackup()}
            className="brand-secondary mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
          >
            <ArchiveRestore size={16} />
            Selecionar backup
          </button>
        </article>
      </section>
    </div>
  );
}
