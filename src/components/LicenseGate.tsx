"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useLicense, createSubscriptionCheckout } from "@/lib/use-license";
import { KeyRound, Loader2, ShieldCheck, ArrowRight, Check, Sparkles, Sun } from "lucide-react";

// Marketing prices shown on the activation screen. Keep these in sync with the
// real Stripe prices (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL). They are for
// display only — the actual amount charged is defined by the Stripe price.
const PRICING = {
  monthly: {
    label: "Mensal",
    amount: "R$ 399",
    suffix: "/mês",
    hint: "Cobrança mensal recorrente",
    badge: null as string | null,
  },
  annual: {
    label: "Anual",
    amount: "R$ 3.588",
    suffix: "/ano",
    hint: "Equivale a R$ 299/mês",
    badge: "Economize 3 meses",
  },
};

const FEATURES = [
  "Clientes e histórico de compras ilimitados",
  "Cotações profissionais em PDF",
  "Controle de licitações, empenhos e saldos",
  "Faturamento e envio de DANFEs por e-mail",
  "Ativação em até 2 computadores",
  "Atualizações automáticas incluídas",
];

// Palette pulled from luminatech.dev.br — warm cream, gold, dark-brown ink.
const GATE_CSS = `
.lx-gate {
  --lx-bg: oklch(0.975 0.006 82);
  --lx-bg-soft: oklch(0.955 0.008 80);
  --lx-ink: oklch(0.18 0.012 60);
  --lx-ink-2: oklch(0.32 0.010 65);
  --lx-ink-3: oklch(0.52 0.008 70);
  --lx-gold: oklch(0.78 0.13 78);
  --lx-gold-deep: oklch(0.62 0.14 68);
  --lx-gold-light: oklch(0.92 0.06 85);
  --lx-hair: oklch(0.18 0.012 60 / 0.10);
  --lx-hair-2: oklch(0.18 0.012 60 / 0.16);
  color: var(--lx-ink);
  background:
    radial-gradient(ellipse 58% 44% at 84% -10%, oklch(0.85 0.10 78 / 0.32), transparent 70%),
    radial-gradient(ellipse 52% 42% at 6% 110%, oklch(0.92 0.06 85 / 0.5), transparent 72%),
    linear-gradient(180deg, var(--lx-bg) 0%, var(--lx-bg-soft) 58%, var(--lx-bg) 100%);
}
.lx-ink { color: var(--lx-ink); }
.lx-ink-2 { color: var(--lx-ink-2); }
.lx-ink-3 { color: var(--lx-ink-3); }
.lx-gold-deep { color: var(--lx-gold-deep); }
.lx-kicker { color: var(--lx-gold-deep); font-size: 0.64rem; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; }
.lx-hairline { width: 7rem; height: 2px; background: linear-gradient(90deg, var(--lx-gold-deep), transparent); border-radius: 2px; }
.lx-mark {
  background: linear-gradient(135deg, var(--lx-gold-deep), var(--lx-gold) 52%, var(--lx-gold-light));
  color: oklch(0.22 0.03 62);
  box-shadow: 0 10px 24px -12px oklch(0.62 0.14 68 / 0.75);
}
.lx-wordmark { font-weight: 650; letter-spacing: -0.02em; color: var(--lx-ink); }
.lx-wordmark em { font-style: normal; font-weight: 400; color: var(--lx-ink-3); }
.lx-card { background: oklch(1 0 0 / 0.66); border: 1px solid var(--lx-hair); border-radius: 1rem; transition: border-color .2s, background .2s, box-shadow .2s; }
.lx-card:hover { border-color: var(--lx-hair-2); }
.lx-card-on { border-color: var(--lx-gold-deep); background: oklch(0.975 0.035 84 / 0.72); box-shadow: 0 0 0 1px var(--lx-gold-deep), 0 20px 44px -30px oklch(0.62 0.14 68 / 0.55); }
.lx-radio { border: 1px solid var(--lx-hair-2); }
.lx-radio-on { border-color: var(--lx-gold-deep); background: var(--lx-gold-deep); color: oklch(0.99 0.01 85); }
.lx-badge { background: linear-gradient(98deg, var(--lx-gold-deep), var(--lx-gold) 60%, var(--lx-gold-light)); color: oklch(0.22 0.03 62); }
.lx-input { width: 100%; background: oklch(1 0 0 / 0.88); border: 1px solid var(--lx-hair-2); color: var(--lx-ink); border-radius: 10px; padding: 12px 14px; outline: none; transition: border-color .2s, box-shadow .2s; }
.lx-input::placeholder { color: var(--lx-ink-3); }
.lx-input:focus { border-color: var(--lx-gold-deep); box-shadow: 0 0 0 3px oklch(0.78 0.13 78 / 0.2); }
.lx-btn { display: flex; width: 100%; align-items: center; justify-content: center; gap: .5rem; border-radius: 10px; padding: 0.85rem 1rem; font-weight: 700; transition: filter .2s, transform .2s, box-shadow .2s; }
.lx-btn:disabled { opacity: .6; cursor: not-allowed; }
.lx-btn-gold { background: linear-gradient(98deg, var(--lx-gold-deep), var(--lx-gold) 55%, var(--lx-gold-light)); color: oklch(0.22 0.03 62); box-shadow: 0 14px 30px -16px oklch(0.62 0.14 68 / 0.85); }
.lx-btn-gold:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
.lx-btn-dark { background: var(--lx-ink); color: var(--lx-bg); box-shadow: 0 12px 26px -16px oklch(0.18 0.012 60 / 0.7); }
.lx-btn-dark:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
.lx-panel { background: oklch(1 0 0 / 0.82); border: 1px solid var(--lx-hair); border-radius: 1.1rem; box-shadow: 0 34px 80px -46px oklch(0.3 0.05 60 / 0.45); }
.lx-feature-ico { color: var(--lx-gold-deep); }
`;

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`lx-wordmark ${className}`}>
      Almeida <em>Lumina</em>
    </span>
  );
}

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isValid, isChecking, error, activate } = useLicense();
  const [keyInput, setKeyInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  async function handleSubscribe() {
    setCheckoutError("");
    if (!checkoutEmail.trim()) {
      setCheckoutError("Informe o e-mail para receber a chave.");
      return;
    }
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
      <div className="lx-gate relative flex min-h-[100svh] flex-col items-center justify-center gap-4">
        <style dangerouslySetInnerHTML={{ __html: GATE_CSS }} />
        <div className="lx-mark flex h-12 w-12 items-center justify-center rounded-xl">
          <Sun size={22} />
        </div>
        <div className="lx-ink-2 flex items-center gap-2">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">Verificando licença…</span>
        </div>
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="lx-gate relative flex min-h-[100svh] flex-col overflow-x-hidden px-4 py-5 sm:px-7 md:py-7">
        <style dangerouslySetInnerHTML={{ __html: GATE_CSS }} />

        <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="lx-mark flex h-10 w-10 items-center justify-center rounded-lg">
              <Sun size={18} />
            </div>
            <div>
              <Wordmark className="text-base" />
              <p className="lx-gold-deep mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em]">
                Lumina Prisma
              </p>
            </div>
          </div>
          <div className="lx-ink-3 hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] sm:flex">
            <ShieldCheck size={14} className="lx-gold-deep" />
            <span>Ativação segura</span>
          </div>
        </header>

        <main className="relative z-10 mx-auto grid w-full min-w-0 max-w-[1440px] flex-1 items-start gap-8 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:py-14">
          {/* Pricing / subscribe */}
          <section className="min-w-0">
            <div className="lx-hairline mb-6 lg:mb-8" aria-hidden="true" />
            <p className="lx-kicker mb-3">Licença · Assinatura</p>
            <h1 className="lx-ink max-w-2xl text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl xl:text-6xl">
              Ative o Lumina Prisma.
            </h1>
            <p className="lx-ink-2 mt-4 max-w-xl text-sm leading-6 sm:text-base sm:leading-7">
              Escolha um plano, assine em instantes e receba sua chave de ativação por e-mail e na
              tela de confirmação.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {(["monthly", "annual"] as const).map((key) => {
                const item = PRICING[key];
                const selected = plan === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlan(key)}
                    aria-pressed={selected}
                    className={`lx-card relative p-5 text-left ${selected ? "lx-card-on" : ""}`}
                  >
                    {item.badge && (
                      <span className="lx-badge absolute -top-2.5 right-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em]">
                        <Sparkles size={10} /> {item.badge}
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="lx-ink-3 text-[10px] font-bold uppercase tracking-[0.16em]">
                        {item.label}
                      </span>
                      <span
                        className={`lx-radio flex h-4 w-4 items-center justify-center rounded-full ${selected ? "lx-radio-on" : ""}`}
                      >
                        {selected && <Check size={11} strokeWidth={3} />}
                      </span>
                    </div>
                    <p className="mt-3 flex items-baseline gap-1">
                      <span className="lx-ink text-3xl font-semibold tracking-[-0.03em]">{item.amount}</span>
                      <span className="lx-ink-3 text-sm font-medium">{item.suffix}</span>
                    </p>
                    <p className="lx-ink-3 mt-1 text-[11px] font-medium">{item.hint}</p>
                  </button>
                );
              })}
            </div>

            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <li key={feature} className="lx-ink-2 flex items-start gap-2 text-xs leading-5">
                  <Check size={14} className="lx-feature-ico mt-0.5 shrink-0" strokeWidth={2.5} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 max-w-md">
              <input
                type="email"
                value={checkoutEmail}
                onChange={(e) => setCheckoutEmail(e.target.value)}
                placeholder="Seu e-mail para receber a chave"
                className="lx-input"
              />
              {checkoutError && <p className="mt-2 text-xs font-medium text-red-600">{checkoutError}</p>}
              <button
                type="button"
                onClick={() => void handleSubscribe()}
                disabled={checkoutBusy}
                className="lx-btn lx-btn-gold mt-3"
              >
                {checkoutBusy ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
                ) : (
                  <>
                    <span>Assinar plano {PRICING[plan].label.toLowerCase()}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
              <p className="lx-ink-3 mt-3 text-center text-[11px]">
                Pagamento seguro via Stripe · requer conexão com a internet
              </p>
            </div>
          </section>

          {/* Activate with existing key */}
          <section className="lx-panel min-w-0 p-5 sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="lx-kicker">Já assinou?</p>
                <h2 className="lx-ink mt-3 text-2xl font-semibold tracking-[-0.035em]">
                  Ativar com sua chave
                </h2>
                <p className="lx-ink-3 mt-2 text-xs leading-5">
                  Cole a chave que você recebeu por e-mail ou na tela de confirmação do pagamento.
                </p>
              </div>
              <div className="lx-mark flex h-11 w-11 items-center justify-center rounded-full">
                <KeyRound size={20} />
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!keyInput.trim()) return;
                setIsSubmitting(true);
                await activate(keyInput.trim());
                setIsSubmitting(false);
              }}
            >
              <label className="block">
                <span className="lx-ink-3 mb-2 block text-[10px] font-bold uppercase tracking-[0.14em]">
                  Chave de ativação
                </span>
                <input
                  type="text"
                  required
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="lx-input font-mono"
                  placeholder="EX: PRISMA-A1B2C3D4-E5F6G7H8"
                />
              </label>

              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                  {error}
                </div>
              )}

              <button type="submit" disabled={isSubmitting} className="lx-btn lx-btn-dark">
                {isSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                ) : (
                  <>
                    <span>Ativar sistema</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="lx-ink-3 mt-6 flex items-center gap-2 border-t border-black/10 pt-5 text-[11px] leading-5">
              <ShieldCheck size={14} className="lx-gold-deep shrink-0" />
              <span>Cada licença ativa até 2 computadores. Seus dados ficam salvos localmente neste PC.</span>
            </div>
          </section>
        </main>

        <footer className="lx-ink-3 relative z-10 mx-auto mt-2 w-full max-w-[1440px] border-t border-black/10 pt-4 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Wordmark className="text-xs" />
            <span>© {new Date().getFullYear()} Almeida Lumina · Lumina Prisma</span>
          </div>
        </footer>
      </div>
    );
  }

  // If valid, render the actual application
  return <>{children}</>;
}
