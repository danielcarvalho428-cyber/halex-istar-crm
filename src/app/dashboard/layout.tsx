"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Database,
  FilePlus2,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptText,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { AccountRole } from "../../types";
import CompanyFooter from "../../components/CompanyFooter";
import { AppUXProvider, QuickSearchButton } from "../../components/AppUX";
import { LuminaProductIdentity } from "../../components/LuminaIdentity";

interface SidebarLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}

function SidebarLink({ href, icon, label, active, onClick }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`sidebar-link ${active ? "sidebar-link-active" : ""}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [role, setRole] = useState<AccountRole>("viewer");
  const [displayName, setDisplayName] = useState("");
  const [simplified, setSimplified] = useState(false);

  React.useEffect(() => {
    queueMicrotask(() => setSimplified(localStorage.getItem("luminaSimplifiedMode") === "true"));
  }, []);

  const toggleSimplified = () => setSimplified((current) => {
    const next = !current;
    localStorage.setItem("luminaSimplifiedMode", String(next));
    return next;
  });

  React.useEffect(() => {
    if (window.halexDesktop) {
      queueMicrotask(() => {
        setRole("admin");
        setDisplayName("Usuário local");
      });
      return;
    }
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((result) => {
        if (result?.ok) {
          setRole(result.data.role === "admin" ? "admin" : "viewer");
          setDisplayName(result.data.displayName || result.data.username || "");
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const isAdmin = role === "admin";
  const fullMenuGroups = [
    {
      label: "Comercial",
      items: [
        {
          href: "/dashboard",
          icon: <LayoutDashboard size={17} />,
          label: "Visão geral",
        },
        {
          href: "/dashboard/clientes",
          icon: <Building2 size={17} />,
          label: "Clientes",
        },
        {
          href: "/dashboard/agenda",
          icon: <CalendarClock size={17} />,
          label: "Agenda e retornos",
        },
      ],
    },
    {
      label: "Cotações",
      items: [
        {
          href: "/dashboard/cotacoes/nova",
          icon: <FilePlus2 size={17} />,
          label: "Nova cotação",
        },
        {
          href: "/dashboard/cotacoes",
          icon: <ReceiptText size={17} />,
          label: "Histórico de cotações",
        },
        {
          href: "/dashboard/catalogo",
          icon: <PackageSearch size={17} />,
          label: "Tabela de produtos",
        },
        {
          href: "/dashboard/acordos",
          icon: <Handshake size={17} />,
          label: "Acordos de preços",
        },
      ],
    },
    {
      label: "Pós-venda",
      items: [
        {
          href: "/dashboard/faturamento",
          icon: <ClipboardCheck size={17} />,
          label: "Acompanhar faturamento",
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "Administração",
            items: [
              {
                href: "/dashboard/configuracoes",
                icon: <Settings size={17} />,
                label: "Configurações",
              },
              {
                href: "/dashboard/importar",
                icon: <BookOpen size={17} />,
                label: "Importar dados",
              },
              {
                href: "/dashboard/backup-local",
                icon: <Database size={17} />,
                label: "Backup",
              },
            ],
          },
        ]
      : []),
  ];
  const menuGroups = simplified ? [{ label: "Essencial", items: [
    { href: "/dashboard", icon: <LayoutDashboard size={17} />, label: "Início" },
    { href: "/dashboard/clientes", icon: <Building2 size={17} />, label: "Clientes" },
    { href: "/dashboard/agenda", icon: <CalendarClock size={17} />, label: "Agenda" },
    { href: "/dashboard/cotacoes/nova", icon: <FilePlus2 size={17} />, label: "Nova cotação" },
    { href: "/dashboard/cotacoes", icon: <ReceiptText size={17} />, label: "Cotações" },
  ] }] : fullMenuGroups;

  const nav = (
    <nav
      aria-label="Navegação principal"
      className="relative z-10 flex flex-1 flex-col gap-6"
    >
      {menuGroups.map((group) => (
        <div key={group.label}>
          <p className="sidebar-section-label">{group.label}</p>
          <div className="mt-2 space-y-1">
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`) &&
                    !(
                      item.href === "/dashboard/cotacoes" &&
                      pathname.startsWith("/dashboard/cotacoes/nova")
                    ))
                }
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return <AppUXProvider simplified={simplified}>
    <div className="product-shell relative flex min-h-screen">
      <aside className="side-rail hidden w-[252px] shrink-0 flex-col gap-7 px-5 py-6 lg:flex">
        <div className="relative z-10 flex items-start justify-between gap-3">
          <BrandHeader />
        </div>
        {nav}
        <SidebarFooter
          role={role}
          displayName={displayName}
          onLogout={handleLogout}
          simplified={simplified}
          onToggleSimplified={toggleSimplified}
        />
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex bg-stone-950/55 backdrop-blur-md lg:hidden">
          <aside className="side-rail flex w-[280px] animate-fade-in flex-col gap-8 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <BrandHeader compact />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMobileMenuOpen(false)}
                className="relative z-10 text-stone-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            {nav}
            <SidebarFooter
              role={role}
              displayName={displayName}
              onLogout={handleLogout}
              simplified={simplified}
              onToggleSimplified={toggleSimplified}
            />
          </aside>
        </div>
      )}

      <div className="workspace flex min-w-0 flex-1 flex-col">
        <header className="mobile-topbar flex items-center justify-between p-4 lg:hidden">
          <BrandHeader compact />
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Abrir menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-stone-300 hover:border-amber-400/40 hover:text-amber-300"
            >
              <Menu size={17} />
            </button>
          </div>
        </header>

        <div className="hidden justify-end px-10 pt-5 lg:flex"><QuickSearchButton /></div>
        <main id="conteudo-principal" tabIndex={-1} className="workspace-canvas mx-auto w-full max-w-[1480px] flex-1 overflow-y-auto p-4 animate-fade-in sm:p-7 lg:px-10 lg:py-9 xl:px-12">
          {children}
        </main>
        <CompanyFooter className="mx-auto w-full max-w-[1480px] px-4 pb-5 sm:px-7 lg:px-10 xl:px-12" />
      </div>
    </div>
  </AppUXProvider>;
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return <LuminaProductIdentity compact={compact} />;
}

function SidebarFooter({
  role,
  displayName,
  onLogout,
  simplified,
  onToggleSimplified,
}: {
  role: AccountRole;
  displayName: string;
  onLogout: () => void;
  simplified: boolean;
  onToggleSimplified: () => void;
}) {
  return (
    <div className="relative z-10 mt-auto flex flex-col gap-4 border-t border-white/8 pt-5">
      <LocalClock />
      <div className="border-l border-amber-400/60 pl-3">
        <p className="readable-name text-xs font-semibold text-white">
          {displayName || "Usuário"}
        </p>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-stone-500">
          {role === "admin" ? "Administrador" : "Visualização"}
        </p>
      </div>
      <button type="button" onClick={onToggleSimplified} aria-pressed={simplified} className="sidebar-mode-toggle">
        <SlidersHorizontal size={14} />
        <span><strong>{simplified ? "Modo simplificado" : "Modo completo"}</strong><small>{simplified ? "Somente funções essenciais" : "Administração disponível"}</small></span>
        <span className={`mode-switch ${simplified ? "on" : ""}`} aria-hidden="true"><i /></span>
      </button>
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-stone-400 transition-all hover:border-red-400/25 hover:bg-red-950/20 hover:text-red-300"
      >
        <LogOut size={12} />
        <span>Sair do Painel</span>
      </button>
    </div>
  );
}

function LocalClock() {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return null;

  return (
    <div className="flex items-center gap-2 text-stone-400" title="Data e hora deste computador">
      <CalendarClock size={14} aria-hidden="true" />
      <time dateTime={now.toISOString()} className="text-[10px] font-medium">
        {new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(now)}
      </time>
    </div>
  );
}
