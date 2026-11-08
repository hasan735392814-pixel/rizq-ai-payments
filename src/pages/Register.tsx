import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { AuthShell, ArrowLink } from '@/components/auth/AuthShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClassName } from '@/components/ui/Field';

export function Register() {
  const navigate = useNavigate();
  const { session, reloadBusiness } = useAuth();
  const { notify } = useToast();
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true });
  }, [session, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (businessName.trim().length < 2) return setError('Enter your business name.');
    if (!email.trim()) return setError('Enter your email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (signUpError) {
      setSubmitting(false);
      setError(
        signUpError.message.toLowerCase().includes('already')
          ? 'An account with this email already exists. Try signing in instead.'
          : 'We could not create your account. Please try again.'
      );
      return;
    }

    if (data.session) {
      const { error: businessError } = await supabase
        .from('businesses')
        .insert({ user_id: data.session.user.id, name: businessName.trim(), email: email.trim() });
      if (businessError) {
        setSubmitting(false);
        setError('Your account was created, but we could not save your business details. Add them in Settings.');
        await reloadBusiness();
        return;
      }
      await reloadBusiness();
      setSubmitting(false);
      notify('Your account is ready.', 'success');
      navigate('/dashboard', { replace: true });
    } else {
      setSubmitting(false);
      notify('Account created. Check your email to continue.', 'info');
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up your business in under a minute and send your first invoice today."
      footer={
        <>
          Already have an account? <ArrowLink to="/login">Sign in</ArrowLink>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Business name" htmlFor="business">
          <input id="business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClassName} maxLength={120} required />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} required />
        </FormField>
        <FormField label="Password" htmlFor="password" hint="At least 8 characters.">
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClassName} required />
        </FormField>
        <Button type="submit" size="lg" fullWidth loading={submitting} variant="accent">
          Create account
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
