"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLicense, createSubscriptionCheckout } from "@/lib/use-license";
import { KeyRound, Lock, Loader2, CreditCard } from "lucide-react";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isValid, isChecking, error, activate } = useLicense();
  const [keyInput, setKeyInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  async function handleSubscribe() {
    setCheckoutError("");
    setCheckoutBusy(true);
    try {
      const url = await createSubscriptionCheckout(plan, checkoutEmail.trim());
      // In Electron this is intercepted and opened in the system browser.
      window.open(url, "_blank", "noopener");
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : "Erro ao iniciar o pagamento.");
    } finally {
      setCheckoutBusy(false);
    }
  }

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

          <div className="mt-8 border-t border-slate-700 pt-6">
            <p className="text-center text-sm font-semibold text-slate-200">
              Ainda não tem uma licença?
            </p>
            <p className="mt-1 text-center text-xs text-slate-500">
              Assine e receba sua chave por e-mail em instantes.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlan("monthly")}
                className={`rounded-lg border py-2 text-xs font-bold transition-colors ${
                  plan === "monthly"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setPlan("annual")}
                className={`rounded-lg border py-2 text-xs font-bold transition-colors ${
                  plan === "annual"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                Anual
              </button>
            </div>

            <input
              type="email"
              value={checkoutEmail}
              onChange={(e) => setCheckoutEmail(e.target.value)}
              placeholder="Seu e-mail para receber a chave"
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {checkoutError && (
              <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-center text-xs font-semibold text-red-500">
                {checkoutError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSubscribe()}
              disabled={checkoutBusy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {checkoutBusy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Abrindo pagamento...
                </>
              ) : (
                <>
                  <CreditCard size={16} /> Assinar agora
                </>
              )}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            A ativação e a assinatura requerem conexão com a internet.
          </p>
        </div>
      </div>
    );
  }

  // If valid, render the actual application
  return <>{children}</>;
}
