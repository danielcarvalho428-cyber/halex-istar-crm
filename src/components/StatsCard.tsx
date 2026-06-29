import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  gradient?: string;
  glow?: boolean;
}

export default function StatsCard({
  title,
  value,
  icon,
  description,
  gradient = 'from-amber-400/12 to-stone-100/5',
  glow = false,
}: StatsCardProps) {
  return (
    <div className={`metric-item group relative flex min-h-[154px] flex-col justify-between p-5 2xl:p-6 ${glow ? 'metric-item-featured' : ''}`}>
      <div className={`pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r ${gradient} opacity-80`} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-stone-500">{title}</p>
          <p className="money-value block text-xl font-semibold leading-tight text-stone-950 2xl:text-2xl">
            {value}
          </p>
        </div>
        <div className="metric-icon shrink-0">
          {icon}
        </div>
      </div>

      {description && (
        <p className="mt-5 border-t border-stone-900/7 pt-3 text-[11px] leading-relaxed text-stone-500">
          {description}
        </p>
      )}
    </div>
  );
}
