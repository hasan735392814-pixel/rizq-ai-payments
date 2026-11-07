import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: 'emerald' | 'navy' | 'amber';
}

const TONE_CLASS = {
  emerald: 'bg-emerald-50 text-emerald-600',
  navy: 'bg-navy-100 text-navy-700',
  amber: 'bg-amber-50 text-amber-600',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'navy' }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-navy-100/80 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-navy-500">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE_CLASS[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-navy-400">{hint}</p>
    </div>
  );
}
