import type { ReactNode } from 'react';

export const inputClassName =
  'block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 shadow-sm transition-colors duration-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-navy-50 disabled:text-navy-400';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string | null;
  hint?: string;
}

export function FormField({ label, htmlFor, children, error, hint }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy-800">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-navy-500">{hint}</p>
      ) : null}
    </div>
  );
}
