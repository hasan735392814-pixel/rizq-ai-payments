import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { AuthShell, ArrowLink } from '@/components/auth/AuthShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClassName } from '@/components/ui/Field';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { notify } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, from, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'Your email or password is incorrect.'
          : 'We could not sign you in right now. Please try again.'
      );
      return;
    }
    notify('Welcome back.', 'success');
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Sign in to manage your invoices and payments."
      footer={
        <>
          New to Rizq? <ArrowLink to="/register">Create an account</ArrowLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} required />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClassName} required />
        </FormField>
        <Button type="submit" size="lg" fullWidth loading={submitting} variant="accent">
          Sign in
        </Button>
        <p className="text-center text-xs text-navy-400">
          <Link to="/" className="hover:text-navy-600">
            Back to home
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
