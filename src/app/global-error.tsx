'use client';

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9f6f2', color: '#211d19' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ maxWidth: 520, textAlign: 'center' }}>
            <p style={{ color: '#bb7300', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Halex Istar CRM
            </p>
            <h1>Algo deu errado</h1>
            <p>Recarregue esta área. Nenhuma alteração foi concluída durante o erro.</p>
            <button
              type="button"
              onClick={unstable_retry}
              style={{ marginTop: 16, padding: '12px 18px', borderRadius: 12, border: 0, background: '#d99522', fontWeight: 700 }}
            >
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
