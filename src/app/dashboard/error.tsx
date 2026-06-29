'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center">
      <div className="glass-card w-full p-8 text-center">
        <AlertTriangle className="mx-auto text-amber-400" size={34} />
        <h2 className="mt-4 text-2xl font-semibold text-stone-950">Não foi possível abrir esta área</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          O sistema encontrou um erro inesperado. Seus dados não foram alterados.
        </p>
        <button
          type="button"
          onClick={unstable_retry}
          className="brand-button mx-auto mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
        >
          <RotateCcw size={16} />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
