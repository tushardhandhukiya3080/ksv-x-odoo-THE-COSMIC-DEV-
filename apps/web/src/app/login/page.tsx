'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

const DEMO = [
  { role: 'Admin', email: 'admin@vendorbridge.dev' },
  { role: 'Officer', email: 'officer@vendorbridge.dev' },
  { role: 'Approver', email: 'approver@vendorbridge.dev' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('officer@vendorbridge.dev');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div className="text-2xl font-extrabold tracking-tight">VendorBridge</div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">
            Procurement, <br /> end to end.
          </h2>
          <p className="mt-4 max-w-md text-brand-100">
            Vendors, RFQs, quotations, approvals, purchase orders and invoices — one auditable
            workflow with AI-assisted comparison.
          </p>
        </div>
        <div className="text-sm text-brand-200">© VendorBridge</div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back. Enter your credentials.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-600">Demo accounts (password: Password123!)</p>
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => setEmail(d.email)}
                className="mt-1 block hover:text-brand-600"
              >
                {d.role}: {d.email}
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            New organization?{' '}
            <Link href="/signup" className="font-semibold text-brand-600">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
