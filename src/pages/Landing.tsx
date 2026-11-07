import { Link } from 'react-router-dom';
import { ArrowRight, Bot, CreditCard, FileText, ShieldCheck } from 'lucide-react';
import { BrandLogo, SandboxBanner } from '@/components/layout/BrandLogo';
import { Button } from '@/components/ui/Button';

const FEATURES = [
  {
    icon: Bot,
    title: 'AI invoice wording',
    body: 'Gemini drafts a clear title, service description and polite payment message. You confirm every amount.',
  },
  {
    icon: CreditCard,
    title: 'PayPal checkout',
    body: 'Customers pay through a secure PayPal link on a page built for phones and desktops.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified payments',
    body: 'An invoice is marked paid only after the server confirms PayPal captured the exact amount.',
  },
  {
    icon: FileText,
    title: 'Clear records',
    body: 'Track invoices, customers and transactions, with an audit trail for every payment action.',
  },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <SandboxBanner />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLogo />
        <nav className="flex items-center gap-3">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50">
            Sign in
          </Link>
          <Link to="/register">
            <Button variant="accent" size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.25),transparent_50%)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-emerald-300 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Built for the PayPal AI Hackathon 2026
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.15] sm:text-5xl animate-fade-up">
            Invoices that write themselves, and payments you can trust.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-navy-200 animate-fade-up">
            Rizq AI Payments helps freelancers and small businesses send professional invoices, get paid through PayPal, and understand their cash flow.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4 animate-fade-up">
            <Link to="/register">
              <Button variant="accent" size="lg" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                Create your account
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:border-white/30">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="group rounded-2xl border border-navy-100 bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-navy-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-navy-100 py-8 text-center text-xs text-navy-400">
        Rizq AI Payments. PayPal Sandbox demonstration. No real money is moved by this application.
      </footer>
    </div>
  );
}
