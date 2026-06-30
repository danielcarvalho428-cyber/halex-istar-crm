"use client";
import { useState } from "react";
import { FileImage, Upload } from "lucide-react";
export default function SettingsPage() {
  const [file, setFile] = useState("");
  async function chooseLetterhead(event: React.MouseEvent<HTMLLabelElement>) {
    if (!window.halexDesktop) return;
    event.preventDefault();
    const selected = await window.halexDesktop.settings.chooseLetterhead();
    if (selected) setFile(selected.split(/[\\/]/).at(-1) || selected);
  }
  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Documentos</p>
        <h1 className="mt-2">Papel timbrado</h1>
        <p className="mt-2 text-sm text-stone-500">
          Configure a identidade aplicada automaticamente a todas as cotações.
        </p>
      </header>
      <section className="glass-card max-w-3xl p-6">
        <div className="flex items-center gap-3">
          <div className="metric-icon">
            <FileImage size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Halex Istar</h2>
            <p className="mt-1 text-xs text-stone-500">
              PDF, PNG ou JPG em alta resolução.
            </p>
          </div>
        </div>
        <label
          onClick={(event) => void chooseLetterhead(event)}
          className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 p-6 text-center hover:border-amber-500"
        >
          <Upload size={24} className="text-amber-700" />
          <p className="mt-3 text-sm font-semibold">
            Selecionar papel timbrado
          </p>
          <p className="mt-1 text-xs text-stone-500">
            O arquivo será armazenado quando o novo Supabase for conectado.
          </p>
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0]?.name || "")}
          />
        </label>
        {file && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Selecionado: {file}
          </p>
        )}
      </section>
    </div>
  );
}
