"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CopyCheck, ShieldCheck, Trash2 } from "lucide-react";
import { appDate, money, type CrmClient } from "@/lib/crm-preview";
import {
  clientIdentityLabel,
  findDuplicateClientGroups,
  formatCnpj,
} from "@/lib/client-duplicates";
import { notifyCrmDataChanged, useDesktopClients } from "@/lib/use-desktop-data";
import { useAppUX } from "@/components/AppUX";

function IdentityBadges({ client }: { client: CrmClient }) {
  const identity = clientIdentityLabel(client);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
      <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{identity.code}</span>
      <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{identity.cnpj}</span>
    </div>
  );
}

export default function DuplicateClientsPage() {
  const allClients = useDesktopClients();
  const { confirm, toast } = useAppUX();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => findDuplicateClientGroups(allClients), [allClients]);
  const duplicateIds = useMemo(
    () => groups.flatMap((group) => group.duplicates.map((client) => client.id)),
    [groups],
  );
  // A duplicate is selected unless the user unchecked it, so the batch delete
  // is one click away right after a large import.
  const isSelected = (id: string) => selected[id] ?? true;
  const selectedIds = duplicateIds.filter(isSelected);

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    const confirmed = await confirm({
      title: `Excluir ${selectedIds.length} cadastro(s) duplicado(s)?`,
      description: "Os cadastros mantidos permanecem na carteira. Clientes com cotações salvas não são excluídos.",
      confirmLabel: "Excluir duplicados",
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      if (window.halexDesktop?.clients) {
        const result = await window.halexDesktop.clients.deleteMany(selectedIds);
        if (result.blocked.length) {
          setError(
            `${result.blocked.length} cadastro(s) mantido(s): ${result.blocked
              .map((item) => `${item.name} — ${item.reason}`)
              .join(" · ")}`,
          );
        }
        toast(`${result.deleted.length} cadastro(s) duplicado(s) excluído(s).`);
      } else {
        const stored = JSON.parse(localStorage.getItem("manualClients") || "[]") as Array<{ id: string }>;
        const removing = new Set(selectedIds);
        localStorage.setItem(
          "manualClients",
          JSON.stringify(stored.filter((item) => !removing.has(item.id))),
        );
        toast(`${selectedIds.length} cadastro(s) duplicado(s) excluído(s).`);
      }
      setSelected({});
      notifyCrmDataChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir os duplicados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">CRM</p>
        <h1 className="mt-2">Clientes duplicados</h1>
        <p className="mt-2 text-sm text-stone-500">
          Cadastros que repetem o mesmo CNPJ ficam em quarentena, fora da carteira ativa, até você decidir qual manter.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/dashboard/clientes" className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
          <ArrowLeft size={14} />
          Voltar para a carteira
        </Link>
        <span className="text-xs font-semibold text-stone-500">
          {groups.length} CNPJ(s) repetido(s) · {duplicateIds.length} cadastro(s) em quarentena
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(Object.fromEntries(duplicateIds.map((id) => [id, true])))} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
            <CopyCheck size={14} />
            Selecionar todos
          </button>
          <button type="button" onClick={() => setSelected(Object.fromEntries(duplicateIds.map((id) => [id, false])))} className="brand-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold">
            Limpar seleção
          </button>
          <button type="button" disabled={busy || selectedIds.length === 0} onClick={() => void deleteSelected()} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 size={14} />
            Excluir {selectedIds.length} selecionado(s)
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

      {groups.length === 0 ? (
        <p className="glass-card p-6 text-sm text-stone-500">
          Nenhum CNPJ repetido na carteira. Cadastros sem CNPJ informado não entram nesta conferência.
        </p>
      ) : (
        <section className="space-y-4">
          {groups.map((group) => (
            <article key={group.document} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <h2 className="font-semibold">CNPJ {formatCnpj(group.document)}</h2>
                <span className="text-xs font-semibold text-stone-500">{group.duplicates.length + 1} cadastros</span>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <ShieldCheck size={14} />
                  Mantido na carteira
                </p>
                <p className="mt-2 font-semibold">{group.keeper.name}</p>
                <IdentityBadges client={group.keeper} />
                <p className="mt-2 text-xs text-stone-600">
                  {group.keeper.city}/{group.keeper.state} · última compra {appDate(group.keeper.lastPurchase)} · {money(group.keeper.total12m)} em 12 meses
                </p>
              </div>

              <ul className="mt-3 space-y-2">
                {group.duplicates.map((client) => (
                  <li key={client.id} className="rounded-lg border border-stone-200 p-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={isSelected(client.id)}
                        onChange={(event) => setSelected((current) => ({ ...current, [client.id]: event.target.checked }))}
                        aria-label={`Excluir cadastro duplicado ${client.name}`}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{client.name}</span>
                        <IdentityBadges client={client} />
                        <span className="mt-2 block text-xs text-stone-500">
                          {client.city}/{client.state} · última compra {appDate(client.lastPurchase)} · {money(client.total12m)} em 12 meses
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
