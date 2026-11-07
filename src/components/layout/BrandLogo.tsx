import { ReceiptText } from 'lucide-react';

export function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
        <ReceiptText className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className={`text-base font-semibold tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>
        Rizq <span className={light ? 'text-emerald-300' : 'text-emerald-600'}>AI Payments</span>
      </span>
    </div>
  );
}

export function SandboxBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">
      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Sandbox</span>
      PayPal Sandbox mode. Test payments only. No real money moves.
    </div>
  );
}
