"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseApp } from "@/lib/firebase";

type License = { id: string; customerName: string; customerEmail: string; plan: string; status: string; expiresAt: number; devices: Array<{ id: string; name?: string }> };
const auth = getAuth(firebaseApp);
const functionsBaseUrl = "https://southamerica-east1-halex-istar-crm.cloudfunctions.net";
function futureDate(months: number) { const date = new Date(); date.setMonth(date.getMonth() + months); return date.toISOString().slice(0, 10); }
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado.";
}

async function callFunction<T>(name: string, data: Record<string, unknown> = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  const idToken = await user.getIdToken(true);
  const response = await fetch(`${functionsBaseUrl}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json().catch(() => null) as { result?: T; data?: T; error?: { status?: string; message?: string } } | null;
  if (!response.ok || payload?.error) {
    const code = payload?.error?.status ? `${payload.error.status}: ` : "";
    throw new Error(`${code}${payload?.error?.message || `Falha no servidor (${response.status}).`}`);
  }
  return (payload?.result ?? payload?.data) as T;
}

export default function LicenseAdminPage() {
  const [user, setUser] = useState(auth.currentUser);
  const [email, setEmail] = useState("faturamento.hibiosoluto@gmail.com");
  const [password, setPassword] = useState("");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [plan, setPlan] = useState("monthly");
  const [expiresAt, setExpiresAt] = useState(() => futureDate(1));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLicenses(await callFunction<License[]>("listLicenses"));
  }

  useEffect(() => onAuthStateChanged(auth, (next) => { setUser(next); if (next) void load().catch((error) => setMessage(errorMessage(error))); }), []);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await signInWithEmailAndPassword(auth, email, password); setPassword(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Login inválido."); }
    finally { setBusy(false); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!customerName.trim() || !customerEmail.trim() || !expiresAt) throw new Error("Preencha cliente, e-mail e vencimento.");
      const result = await callFunction<{ id: string }>("saveLicense", { customerName, customerEmail, plan, status: "active", expiresAt: new Date(`${expiresAt}T23:59:59`).getTime() });
      setMessage(`Licença criada: ${result.id}`); setCustomerName(""); setCustomerEmail(""); await load();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function status(id: string, value: string) { await callFunction("setLicenseStatus", { id, status: value }); await load(); }
  async function removeDevice(id: string, deviceId: string) { if (!confirm("Liberar este computador?")) return; await callFunction("removeLicenseDevice", { id, deviceId }); await load(); }

  if (!user) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6"><form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6"><h1 className="text-xl font-bold">Administração de licenças</h1><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="form-input w-full" placeholder="E-mail"/><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="form-input w-full" placeholder="Senha"/>{message && <p className="text-sm text-red-700">{message}</p>}<button disabled={busy} className="brand-button w-full p-3 font-bold">Entrar</button></form></main>;

  return <main className="min-h-screen bg-stone-100 p-6"><div className="mx-auto max-w-6xl space-y-6"><header className="flex items-end justify-between"><div><p className="lumina-kicker">Halex Istar CRM</p><h1 className="mt-2 text-3xl font-semibold">Licenças</h1></div><button onClick={() => void signOut(auth)} className="brand-secondary px-4 py-2 text-sm font-bold">Sair</button></header>
    {message && <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</p>}
    <form noValidate onSubmit={create} className="glass-card grid items-end gap-3 p-5 md:grid-cols-5">
      <label className="text-xs font-bold">Cliente<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="form-input mt-1 w-full" placeholder="Nome da empresa"/></label>
      <label className="text-xs font-bold">E-mail<input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="form-input mt-1 w-full" placeholder="cliente@empresa.com"/></label>
      <label className="text-xs font-bold">Plano<select value={plan} onChange={(e) => { const value = e.target.value; setPlan(value); setExpiresAt(futureDate(value === "annual" ? 12 : 1)); }} className="form-input mt-1 w-full"><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <label className="text-xs font-bold">Vencimento<input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="form-input mt-1 w-full"/></label>
      <button type="submit" disabled={busy} className="brand-button px-4 font-bold">{busy ? "Criando..." : "Criar licença"}</button>
    </form>
    <section className="glass-card overflow-hidden"><div className="divide-y divide-stone-200">{licenses.map((license) => <article key={license.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_220px_260px]"><div><strong>{license.customerName}</strong><p className="mt-1 font-mono text-xs text-amber-800">{license.id}</p><p className="mt-1 text-xs text-stone-500">{license.customerEmail} · {license.plan === "annual" ? "Anual" : "Mensal"} · vence {new Date(license.expiresAt).toLocaleDateString("pt-BR")}</p></div><select value={license.status} onChange={(e) => void status(license.id, e.target.value)} className="form-input"><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="expired">Expirada</option></select><div><p className="text-xs font-bold">Computadores ({license.devices.length}/2)</p>{license.devices.map((device) => <button key={device.id} onClick={() => void removeDevice(license.id, device.id)} className="mt-1 block text-left text-xs text-red-700">Liberar: {device.name || device.id}</button>)}</div></article>)}{licenses.length === 0 && <p className="p-6 text-sm text-stone-500">Nenhuma licença criada.</p>}</div></section>
  </div></main>;
}
