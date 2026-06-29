'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import type { AccountRole, AppAccount } from '../../../../types';

type AccountForm = {
  username: string;
  password: string;
  role: AccountRole;
  displayName: string;
  company: string;
};

const emptyForm: AccountForm = {
  username: '',
  password: '',
  role: 'viewer',
  displayName: '',
  company: '',
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AppAccount[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAccounts() {
    setLoading(true);
    try {
      const response = await fetch('/api/accounts', { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Erro ao carregar contas.');
      setAccounts(result.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar contas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAccounts();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...form }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Erro ao criar conta.');

      setForm(emptyForm);
      setMessage('Conta criada com sucesso.');
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao criar conta.');
    } finally {
      setSaving(false);
    }
  }

  async function setAccountActive(account: AppAccount, active: boolean) {
    setMessage('');
    const response = await fetch('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: account.id,
        role: account.role,
        displayName: account.display_name || '',
        company: account.company || '',
        active,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setMessage(result.message || 'Erro ao atualizar conta.');
      return;
    }
    await loadAccounts();
  }

  async function deleteAccount(account: AppAccount) {
    if (!confirm(`Excluir a conta ${account.username}?`)) return;

    const response = await fetch('/api/accounts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: account.id }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setMessage(result.message || 'Erro ao excluir conta.');
      return;
    }
    await loadAccounts();
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="page-hero flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="lumina-kicker mb-2">Administrador</p>
          <h1 className="text-3xl font-semibold text-stone-50">Contas de acesso</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
            Crie contas para pessoas ou empresas. Contas de visualizacao podem consultar dados, mas nao podem alterar nada.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
          <ShieldCheck size={14} />
          Admin
        </div>
      </div>

      <form onSubmit={createAccount} className="glass-card grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
        <label className="block xl:col-span-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-400">Usuario</span>
          <input
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            className="form-input w-full"
            placeholder="cliente@empresa"
            required
          />
        </label>
        <label className="block xl:col-span-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-400">Senha</span>
          <input
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            type="password"
            className="form-input w-full"
            minLength={8}
            placeholder="Min. 8"
            required
          />
        </label>
        <label className="block xl:col-span-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-400">Permissao</span>
          <select
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AccountRole }))}
            className="form-input w-full"
          >
            <option value="viewer">Visualizacao</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label className="block xl:col-span-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-400">Nome</span>
          <input
            value={form.displayName}
            onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
            className="form-input w-full"
            placeholder="Pessoa"
          />
        </label>
        <label className="block xl:col-span-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-400">Empresa</span>
          <input
            value={form.company}
            onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
            className="form-input w-full"
            placeholder="Empresa"
          />
        </label>
        <div className="flex items-end xl:col-span-1">
          <button disabled={saving} className="brand-button flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60">
            <UserPlus size={16} />
            {saving ? 'Criando...' : 'Criar conta'}
          </button>
        </div>
      </form>

      {message && (
        <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {message}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-amber-200/10 px-5 py-4">
          <Users size={16} className="text-amber-300" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300">Contas cadastradas</h3>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-stone-400">Carregando contas...</div>
        ) : accounts.length === 0 ? (
          <div className="p-5 text-sm text-stone-400">Nenhuma conta criada ainda.</div>
        ) : (
          <div className="divide-y divide-amber-200/10">
            {accounts.map((account) => (
              <div key={account.id} className="grid gap-3 p-5 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] md:items-center">
                <div>
                  <p className="font-semibold text-stone-100">{account.display_name || account.username}</p>
                  <p className="mt-1 text-xs text-stone-500">{account.username}</p>
                </div>
                <p className="text-sm text-stone-400">{account.company || 'Sem empresa'}</p>
                <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${account.role === 'admin' ? 'bg-amber-300/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'}`}>
                  {account.role === 'admin' ? 'Admin' : 'Visualizacao'}
                </span>
                <button
                  type="button"
                  onClick={() => setAccountActive(account, !account.active)}
                  className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${account.active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}
                >
                  {account.active ? 'Ativa' : 'Bloqueada'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteAccount(account)}
                  className="flex w-fit items-center gap-2 rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-300"
                >
                  <Trash2 size={13} />
                  Excluir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
