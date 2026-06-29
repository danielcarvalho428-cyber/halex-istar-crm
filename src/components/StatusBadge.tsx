import React from 'react';
import { LicitacaoStatus, ItemStatus, EmpenhoStatus } from '../types';

type AnyStatus = LicitacaoStatus | ItemStatus | EmpenhoStatus;

interface StatusBadgeProps {
  status: AnyStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  // Normalize the status string
  const normalized = status.toLowerCase().trim();

  let label: string = status;
  let classes = 'bg-stone-500/10 text-stone-400 border-stone-500/20';

  switch (normalized) {
    // Licitações status
    case 'em_andamento':
      label = 'Em Andamento';
      classes = 'bg-amber-300/10 text-amber-300 border-amber-300/20';
      break;
    case 'ganha':
      label = 'Ganha';
      classes = 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20';
      break;
    case 'ganho':
      label = 'Ganho';
      classes = 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20';
      break;
    case 'perdida':
      label = 'Perdida';
      classes = 'bg-red-400/10 text-red-300 border-red-400/20';
      break;
    case 'perdido':
      label = 'Perdido';
      classes = 'bg-red-400/10 text-red-300 border-red-400/20';
      break;
    case 'parcial':
      label = 'Parcial';
      classes = 'bg-stone-200/10 text-stone-200 border-stone-200/20';
      break;
    
    // Items / Empenhos status
    case 'cancelada':
    case 'cancelado':
      label = 'Cancelado';
      classes = 'bg-stone-600/10 text-stone-400 border-stone-600/20';
      break;
    case 'desclassificado':
      label = 'Desclassificado';
      classes = 'bg-rose-400/10 text-rose-300 border-rose-400/20';
      break;
    case 'pendente':
      label = 'Pendente';
      classes = 'bg-amber-200/10 text-amber-200 border-amber-200/20';
      break;
    case 'ativo':
      label = 'Ativo';
      classes = 'bg-amber-300/10 text-amber-300 border-amber-300/20 glow-indigo';
      break;
    case 'entregue':
      label = 'Entregue';
      classes = 'bg-teal-400/10 text-teal-300 border-teal-400/20';
      break;
    case 'pago':
      label = 'Pago';
      classes = 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20';
      break;
    default:
      label = status;
      break;
  }

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}
