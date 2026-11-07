import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type Tone = 'info' | 'success' | 'error' | 'warning';

const TONE: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-navy-200 bg-navy-50 text-navy-800', icon: <Info className="h-5 w-5 text-navy-500" aria-hidden="true" /> },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
  },
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" /> },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />,
  },
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function Alert({ tone = 'info', title, children, action }: AlertProps) {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`flex items-start gap-3 rounded-xl border p-4 animate-fade-in ${TONE[tone].box}`}>
      <div className="mt-0.5">{TONE[tone].icon}</div>
      <div className="flex-1 space-y-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        <div className="text-sm leading-relaxed">{children}</div>
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
