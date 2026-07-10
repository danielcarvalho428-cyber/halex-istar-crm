import type { SVGProps } from "react";

export function LuminaMark({ className = "", ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 40 40" className={className} aria-hidden="true" {...props}>
    <defs><linearGradient id="lumina-prisma-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6d493"/><stop offset="1" stopColor="#a86d24"/></linearGradient></defs>
    <circle cx="20" cy="20" r="18.5" fill="#1a1308"/><circle cx="20" cy="20" r="18" fill="none" stroke="rgba(246,212,147,.18)"/>
    <path d="M11 28 20 10l9 18M14.5 22h11" stroke="url(#lumina-prisma-gold)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="m28.8 8.4.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9Z" fill="#fff5d8"/>
  </svg>;
}

export function LuminaProductIdentity({ compact = false }: { compact?: boolean }) {
  return <div className="lumina-product-identity"><LuminaMark className={compact ? "h-9 w-9" : "h-11 w-11"}/><div className="min-w-0"><p className="lumina-product-name"><span>Lumina</span> Prisma</p>{!compact && <p className="lumina-product-endorsement">Um produto Almeida Lumina</p>}</div></div>;
}
