'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    organizationName: '',
    name: '',
    email: '',
    password: '',
    gstin: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup({ ...form, gstin: form.gstin || undefined });
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-extrabold text-brand-600">VendorBridge</div>
          <h1 className="mt-4 text-2xl font-bold">Create your organization</h1>
          <p className="mt-1 text-sm text-slate-500">You&apos;ll be the admin of a new workspace.</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Organization name</label>
            <input className="input" value={form.organizationName} onChange={set('organizationName')} required />
          </div>
          <div>
            <label className="label">GSTIN (optional)</label>
            <input className="input" value={form.gstin} onChange={set('gstin')} placeholder="27AAACA1234A1Z5" />
          </div>
          <div>
            <label className="label">Your name</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} required />
            <p className="mt-1 text-xs text-slate-400">Min 8 chars with upper, lower & a number.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
