import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { BrandLogo, SandboxBanner } from '@/components/layout/BrandLogo';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <SandboxBanner />
      <div className="grid min-h-[calc(100vh-36px)] lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
          <Link to="/" aria-label="Rizq AI Payments home">
            <BrandLogo light />
          </Link>
          <div className="relative max-w-md space-y-6 animate-fade-up">
            <h2 className="text-3xl font-semibold leading-tight">Get paid faster with invoices your customers can pay in one click.</h2>
            <p className="text-navy-200 leading-relaxed">
              Create invoices, let AI polish the wording, and track verified PayPal payments in one dashboard.
            </p>
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Payments are verified on the server before an invoice is marked paid.
            </div>
          </div>
          <p className="text-xs text-navy-300">PayPal Sandbox demo. Test payments only.</p>
        </div>

        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md animate-fade-up">
            <div className="mb-8 lg:hidden">
              <Link to="/">
                <BrandLogo />
              </Link>
            </div>
            <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
            <p className="mt-2 text-sm text-navy-500">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-8 text-center text-sm text-navy-500">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArrowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 font-medium text-emerald-700 transition-colors hover:text-emerald-600">
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}
