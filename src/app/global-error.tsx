'use client';

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f4f6f8', color: '#172033' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ maxWidth: 520, textAlign: 'center' }}>
            <p style={{ color: '#b36f12', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Lumina Prisma
            </p>
            <h1>Algo deu errado</h1>
            <p>Recarregue esta área. Nenhuma alteração foi concluída durante o erro.</p>
            <button
              type="button"
              onClick={unstable_retry}
              style={{ marginTop: 16, padding: '12px 18px', borderRadius: 8, border: 0, background: '#172033', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
