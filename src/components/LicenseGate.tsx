"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLicense } from "@/lib/use-license";
import { KeyRound, Lock, Loader2 } from "lucide-react";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isValid, isChecking, error, activate } = useLicense();
  const [keyInput, setKeyInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (pathname === "/license-admin") return <>{children}</>;

  if (isChecking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-400">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-800 p-8 shadow-2xl">
          <div className="mb-8 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700">
              <Lock size={32} className="text-blue-500" />
            </div>
          </div>
          <h1 className="text-center text-2xl font-black text-white">
            HALEX ISTAR CRM
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            Este software requer uma chave de licença ativa para funcionar.
          </p>

          <form
            className="mt-8 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!keyInput.trim()) return;
              setIsSubmitting(true);
              await activate(keyInput.trim());
              setIsSubmitting(false);
            }}
          >
            <div>
              <label className="text-xs font-bold uppercase text-slate-400">
                Chave de Ativação
              </label>
              <div className="relative mt-2">
                <KeyRound
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  required
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 font-mono text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="EX: HALEX-A1B2C3D4-E5F6G7H8"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-3 text-center text-xs font-semibold text-red-500">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Verificando...
                </>
              ) : (
                "Ativar Sistema"
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            A ativação requer conexão com a internet.
          </p>
        </div>
      </div>
    );
  }

  // If valid, render the actual application
  return <>{children}</>;
}
