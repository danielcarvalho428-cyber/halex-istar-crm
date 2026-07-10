'use client';

import React, { FormEvent, useState } from 'react';
import { ArrowRight, CalendarClock, FileText, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import CompanyFooter from '../../components/CompanyFooter';
import { LuminaProductIdentity } from '../../components/LuminaIdentity';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        setError(data?.message || 'Não foi possível entrar. Confira usuário e senha.');
        return;
      }

      window.location.assign('/dashboard');
    } catch {
      setError('Não foi possível conectar ao servidor de login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell relative flex min-h-[100svh] flex-1 flex-col overflow-x-hidden px-4 py-5 sm:px-7 md:py-7">
      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between">
        <LuminaProductIdentity />
        <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 sm:flex">
          <ShieldCheck size={14} className="text-amber-400" />
          <span>Acesso protegido</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full min-w-0 max-w-[1440px] flex-1 items-start gap-8 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12 lg:py-16">
        <section className="order-last min-w-0 max-w-3xl lg:order-first">
          <div className="login-signal mb-6 lg:mb-10" aria-hidden="true">
            <span />
          </div>
          <p className="lumina-kicker mb-3 lg:mb-5">Inteligência comercial · Mercado privado</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-white sm:text-6xl xl:text-8xl">
            O momento certo para cada cliente.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-400 sm:mt-6 sm:text-base sm:leading-7">
            Histórico de compras, ciclo de recompra, relacionamento e cotações profissionais reunidos em uma única operação.
          </p>
          <div className="mt-7 hidden border-y border-white/10 sm:grid sm:grid-cols-3 lg:mt-10">
            {[
              [Users, 'Carteira', 'Clientes'],
              [CalendarClock, 'Inteligência', 'Ciclo de compra'],
              [FileText, 'Operação', 'Cotações automáticas'],
            ].map(([Icon, label, detail], index) => (
              <div key={String(label)} className={`py-4 sm:px-5 ${index ? 'border-t border-white/10 sm:border-l sm:border-t-0' : ''}`}>
                <Icon size={17} className="text-amber-400" />
                <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.16em] text-stone-500">{String(label)}</p>
                <p className="mt-1 text-xs font-semibold text-stone-200">{String(detail)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="login-panel order-first min-w-0 p-5 sm:p-8 lg:order-last">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="lumina-kicker">Login</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-stone-950">
                Acesso ao painel
              </h2>
              <p className="mt-2 text-xs leading-5 text-stone-500">Use suas credenciais para acessar o ambiente privado.</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/30 bg-amber-100/60 text-amber-800">
              <LockKeyhole size={20} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                Usuário
              </span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                className="form-input w-full"
                placeholder="Digite seu usuário"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                Senha
              </span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
                className="form-input w-full"
                placeholder="Digite sua senha"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-2 text-xs font-medium text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="brand-button mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3.5 font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </section>
      </main>
      <CompanyFooter dark className="relative z-10 mx-auto w-full max-w-[1440px]" />
    </div>
  );
}
