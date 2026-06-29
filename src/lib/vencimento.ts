import { formatAppDate, parseAppDate } from './date';

export type VencimentoStatus = 'sem_data' | 'ok' | 'proximo' | 'vencido';

export interface VencimentoInfo {
  status: VencimentoStatus;
  label: string;
  daysRemaining: number | null;
}

export function parseVencimentoDate(dataVencimento?: string | null) {
  return parseAppDate(dataVencimento);
}

export function formatVencimentoDate(dataVencimento?: string | null) {
  return formatAppDate(dataVencimento);
}

export function getVencimentoInfo(dataVencimento?: string | null, warningDays = 30): VencimentoInfo {
  if (!dataVencimento) {
    return { status: 'sem_data', label: 'Sem vencimento', daysRemaining: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = parseVencimentoDate(dataVencimento);
  if (!due) {
    return { status: 'sem_data', label: 'Sem vencimento', daysRemaining: null };
  }

  const daysRemaining = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { status: 'vencido', label: `Vencido ha ${Math.abs(daysRemaining)} dia(s)`, daysRemaining };
  }

  if (daysRemaining <= warningDays) {
    return { status: 'proximo', label: `Vence em ${daysRemaining} dia(s)`, daysRemaining };
  }

  return { status: 'ok', label: `Vence em ${daysRemaining} dia(s)`, daysRemaining };
}

export function isVencimentoExpired(dataVencimento?: string | null) {
  return getVencimentoInfo(dataVencimento).status === 'vencido';
}

export function getVencimentoClasses(status: VencimentoStatus) {
  switch (status) {
    case 'vencido':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'proximo':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'ok':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    default:
      return 'bg-slate-800/60 text-slate-400 border-slate-700';
  }
}
