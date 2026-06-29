'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  ['/dashboard/comercial/tendencias', 'Tendências'],
  ['/dashboard/comercial/pipeline', 'Pipeline'],
  ['/dashboard/comercial/agenda', 'Agenda'],
  ['/dashboard/comercial/relatorios', 'Relatórios'],
  ['/dashboard/comercial/qualidade', 'Qualidade dos dados'],
  ['/dashboard/comercial/historico', 'Histórico'],
] as const;

export default function CommercialNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação comercial" className="commercial-nav grid grid-cols-2 gap-1 p-1 sm:grid-cols-3 xl:flex">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-center text-xs font-bold transition-all ${
            pathname.startsWith(href)
              ? 'bg-amber-300 text-stone-950 shadow-[0_8px_24px_-14px_rgba(245,181,83,0.9)]'
              : 'text-stone-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
