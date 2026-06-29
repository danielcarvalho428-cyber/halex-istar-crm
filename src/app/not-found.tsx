import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="glass-card max-w-lg p-8 text-center">
        <p className="lumina-kicker">Página não encontrada</p>
        <h1 className="mt-3 text-3xl font-semibold text-stone-950">Este endereço não existe</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          Volte ao painel para continuar trabalhando com as licitações.
        </p>
        <Link href="/dashboard" className="brand-button mt-6 inline-flex rounded-xl px-5 py-3 text-sm font-semibold">
          Voltar ao painel
        </Link>
      </section>
    </main>
  );
}
