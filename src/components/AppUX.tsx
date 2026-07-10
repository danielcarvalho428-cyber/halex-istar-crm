"use client";

import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Command, Search, TriangleAlert, X } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ConfirmOptions = { title: string; description?: string; confirmLabel?: string; destructive?: boolean };
type UXContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openCommandPalette: () => void;
};

const UXContext = createContext<UXContextValue | null>(null);
const commands = [
  ["Visão geral", "/dashboard", "início resumo indicadores"],
  ["Nova cotação", "/dashboard/cotacoes/nova", "criar proposta orçamento"],
  ["Clientes", "/dashboard/clientes", "carteira contato hospital distribuidor"],
  ["Agenda e retornos", "/dashboard/agenda", "hoje ligação acompanhamento"],
  ["Histórico de cotações", "/dashboard/cotacoes", "propostas rascunhos"],
  ["Produtos", "/dashboard/catalogo", "catálogo tabela preço"],
  ["Acordos de preços", "/dashboard/acordos", "grupo especial"],
  ["Faturamento", "/dashboard/faturamento", "nota fiscal pedido danfe"],
  ["Importar dados", "/dashboard/importar", "planilha excel"],
  ["Backup", "/dashboard/backup-local", "segurança restaurar"],
  ["Configurações", "/dashboard/configuracoes", "email papel timbrado"],
] as const;

export function AppUXProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: ToastKind }>>([]);
  const [confirmation, setConfirmation] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  }, []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmation({ ...options, resolve })), []);
  const closeConfirmation = useCallback((result: boolean) => {
    setConfirmation((current) => { current?.resolve(result); return null; });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") { setPaletteOpen(false); if (confirmation) closeConfirmation(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmation, closeConfirmation]);
  useEffect(() => { if (paletteOpen) window.setTimeout(() => inputRef.current?.focus(), 0); }, [paletteOpen]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return commands.filter(([label, , keywords]) => `${label} ${keywords}`.toLocaleLowerCase("pt-BR").includes(needle));
  }, [query]);
  const navigate = (href: string) => { setPaletteOpen(false); setQuery(""); router.push(href); };

  return <UXContext.Provider value={{ toast, confirm, openCommandPalette: () => setPaletteOpen(true) }}>
    <a href="#conteudo-principal" className="skip-link">Pular para o conteúdo</a>
    {children}
    <div className="fixed right-4 top-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((item) => <div key={item.id} className={`toast-card ${item.kind}`}>
        {item.kind === "error" ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
        <span className="flex-1 text-sm font-semibold">{item.message}</span>
        <button aria-label="Fechar aviso" onClick={() => setToasts((current) => current.filter((entry) => entry.id !== item.id))}><X size={16} /></button>
      </div>)}
    </div>
    {confirmation && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(false); }}>
      <section className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <div className={`dialog-icon ${confirmation.destructive ? "destructive" : ""}`}><TriangleAlert size={20} /></div>
        <h2 id="confirm-title" className="mt-4 text-lg font-semibold">{confirmation.title}</h2>
        {confirmation.description && <p id="confirm-description" className="mt-2 text-sm leading-6 text-stone-600">{confirmation.description}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button autoFocus className="brand-secondary rounded-lg px-4 py-2 text-sm font-bold" onClick={() => closeConfirmation(false)}>Cancelar</button>
          <button className={confirmation.destructive ? "danger-button" : "brand-button rounded-lg px-4 py-2 text-sm font-bold"} onClick={() => closeConfirmation(true)}>{confirmation.confirmLabel || "Confirmar"}</button>
        </div>
      </section>
    </div>}
    {paletteOpen && <div className="dialog-backdrop items-start pt-[12vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
      <section className="command-card" role="dialog" aria-modal="true" aria-label="Busca rápida">
        <div className="flex items-center gap-3 border-b border-stone-200 px-4"><Search size={18} className="text-stone-400" /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) navigate(matches[0][1]); }} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar página ou ação…" /><kbd>Esc</kbd></div>
        <div className="max-h-[55vh] overflow-y-auto p-2">{matches.map(([label, href]) => <button key={href} className="command-item" onClick={() => navigate(href)}><Command size={15} /><span>{label}</span>{pathname === href && <span className="ml-auto text-[10px] font-bold uppercase text-amber-700">Atual</span>}</button>)}{matches.length === 0 && <p className="p-6 text-center text-sm text-stone-500">Nenhuma ação encontrada.</p>}</div>
        <p className="border-t border-stone-100 px-4 py-2 text-[10px] text-stone-400">Enter para abrir · Esc para fechar</p>
      </section>
    </div>}
  </UXContext.Provider>;
}

export function useAppUX() {
  const context = useContext(UXContext);
  if (!context) throw new Error("useAppUX deve ser usado dentro de AppUXProvider");
  return context;
}

export function QuickSearchButton() {
  const { openCommandPalette } = useAppUX();
  return <button type="button" onClick={openCommandPalette} className="quick-search-button" aria-label="Abrir busca rápida"><Search size={14} /><span>Buscar</span><kbd>Ctrl K</kbd></button>;
}
