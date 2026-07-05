"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { CrmClient } from "@/lib/crm-preview";

function ClientForm() {
  const router = useRouter();
  const editId = useSearchParams().get("editId");
  const [existing, setExisting] = useState<Partial<DesktopClient> | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    carteira: "",
    clientType: "hospital" as "hospital" | "distribuidor",
    cnpj: "",
    city: "",
    state: "",
    contact: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    if (!editId) return;
    async function load() {
      let client: Partial<DesktopClient> | null = null;
      if (window.halexDesktop) client = await window.halexDesktop.clients.get(editId!);
      else {
        let stored: CrmClient[] = [];
        try {
          const parsed = JSON.parse(localStorage.getItem("manualClients") || "[]");
          if (Array.isArray(parsed)) stored = parsed;
        } catch {}
        const found = stored.find((item) => item.id === editId);
        if (found) client = {
          ...found,
          client_type: found.clientType,
          document: found.cnpj,
          last_purchase: found.lastPurchase,
          average_cycle_days: found.averageCycleDays,
          next_purchase: found.nextPurchase,
          total_12m: found.total12m,
        };
      }
      if (!client) return;
      setExisting(client);
      setForm({
        name: String(client.name || ""),
        code: String(client.code || ""),
        carteira: String(client.carteira || ""),
        clientType: client.client_type === "distribuidor" ? "distribuidor" : "hospital",
        cnpj: String(client.document || client.cnpj || ""),
        city: String(client.city || ""),
        state: String(client.state || ""),
        contact: String(client.contact || ""),
        phone: String(client.phone || ""),
        email: String(client.email || ""),
      });
    }
    void load();
  }, [editId]);

  const formatCNPJ = (value: string) => {
    let v = value.replace(/\D/g, "");
    if (v.length > 14) v = v.substring(0, 14);
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
    return v;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === "cnpj") {
      setForm((prev) => ({ ...prev, [name]: formatCNPJ(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Create new CrmClient format
    const newClient: CrmClient = {
      id: editId || `manual-${Date.now()}`,
      code: form.code,
      name: form.name,
      city: form.city,
      state: form.state,
      contact: form.contact,
      phone: form.phone,
      email: form.email,
      // A client registration or quotation is not evidence of a completed sale.
      lastPurchase: String(existing?.last_purchase || ""),
      averageCycleDays: Number(existing?.average_cycle_days || 0),
      nextPurchase: String(existing?.next_purchase || ""),
      total12m: Number(existing?.total_12m || 0),
      status: "Em ciclo",
      clientType: form.clientType,
      carteira: form.carteira,
      cnpj: form.cnpj,
    };

    try {
      if (window.halexDesktop) {
        await window.halexDesktop.clients.save({
          id: newClient.id,
          code: newClient.code,
          name: newClient.name,
          document: newClient.cnpj,
          city: newClient.city,
          state: newClient.state.toUpperCase(),
          contact: newClient.contact,
          phone: newClient.phone,
          email: newClient.email,
          // Preserve fields this form doesn't edit so an edit doesn't wipe them.
          status: existing?.status ? String(existing.status) : "active",
          notes: existing?.notes,
          address: existing?.address,
          last_purchase: newClient.lastPurchase,
          average_cycle_days: newClient.averageCycleDays,
          next_purchase: newClient.nextPurchase,
          total_12m: newClient.total12m,
          client_type: newClient.clientType,
          carteira: newClient.carteira,
        });
      } else {
        let manualClients: CrmClient[] = [];
        try {
          const parsed = JSON.parse(localStorage.getItem("manualClients") || "[]");
          if (Array.isArray(parsed)) manualClients = parsed;
        } catch {}
        const index = manualClients.findIndex((client) => client.id === newClient.id);
        if (index >= 0) manualClients[index] = newClient;
        else manualClients.push(newClient);
        localStorage.setItem("manualClients", JSON.stringify(manualClients));
      }
      router.push("/dashboard/clientes");
    } catch (caught) {
      setError(
        caught instanceof Error && /unique|constraint/i.test(caught.message)
          ? "Já existe um cliente com este código. Use um código diferente."
          : "Não foi possível salvar o cliente. Verifique os dados e tente novamente.",
      );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <header className="page-hero">
        <Link
          href="/dashboard/clientes"
          className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para clientes
        </Link>
        <h1 className="mt-4">{editId ? "Editar cliente" : "Adicionar cliente"}</h1>
        <p className="mt-2 text-sm text-stone-500">
          {editId ? "Atualize os dados do cliente." : "Cadastre um novo cliente manualmente para utilizá-lo nas cotações."}
        </p>
      </header>

      {error && (
        <div className="max-w-2xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="glass-card max-w-2xl p-6">
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold md:col-span-2">
              Razão Social / Nome
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="form-input mt-2 w-full"
                placeholder="Ex: Hospital das Clínicas"
                required
              />
            </label>
            <label className="text-xs font-bold">
              Código
              <input
                name="code"
                value={form.code}
                onChange={handleChange}
                className="form-input mt-2 w-full"
                placeholder="Ex: 12345"
                required
              />
            </label>
            <label className="text-xs font-bold">
              CNPJ
              <input
                name="cnpj"
                value={form.cnpj}
                onChange={handleChange}
                className="form-input mt-2 w-full font-mono text-sm"
                placeholder="00.000.000/0000-00"
                maxLength={18}
                required
              />
            </label>
            <label className="text-xs font-bold md:col-span-2">
              Tipo de Cliente
              <select
                name="clientType"
                value={form.clientType}
                onChange={handleChange}
                className="form-input mt-2 w-full"
              >
                <option value="hospital">Hospital / Clínica</option>
                <option value="distribuidor">Distribuidor</option>
              </select>
            </label>
            <label className="text-xs font-bold md:col-span-2">
              Carteira (Região)
              <input
                name="carteira"
                value={form.carteira}
                onChange={handleChange}
                className="form-input mt-2 w-full"
                placeholder="Ex: Sul, Capital, Interior..."
              />
            </label>
            <label className="text-xs font-bold">
              Cidade
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                className="form-input mt-2 w-full"
                required
              />
            </label>
            <label className="text-xs font-bold">
              Estado (UF)
              <input
                name="state"
                value={form.state}
                onChange={handleChange}
                className="form-input mt-2 w-full"
                maxLength={2}
                required
              />
            </label>
            <label className="text-xs font-bold md:col-span-2">
              Contato (Nome)
              <input
                name="contact"
                value={form.contact}
                onChange={handleChange}
                className="form-input mt-2 w-full"
              />
            </label>
            <label className="text-xs font-bold">
              Telefone
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="form-input mt-2 w-full"
              />
            </label>
            <label className="text-xs font-bold">
              E-mail
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="form-input mt-2 w-full"
              />
            </label>
          </div>
          
          <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-6">
            <Link
              href="/dashboard/clientes"
              className="brand-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              className="brand-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
            >
              <Save size={16} />
              {editId ? "Salvar alterações" : "Salvar cliente"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function NovoClientePage() {
  return <Suspense fallback={<div className="p-10 text-center text-sm text-stone-500">Carregando cliente...</div>}><ClientForm /></Suspense>;
}
