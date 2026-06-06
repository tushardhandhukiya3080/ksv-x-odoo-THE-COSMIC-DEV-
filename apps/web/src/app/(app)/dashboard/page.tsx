'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import { PageHeader, Spinner, StatusBadge } from '@/components/ui';

interface Summary {
  cards: {
    activeRfqs: number;
    pendingApprovals: number;
    openInvoices: number;
    totalSpend: number;
    vendorCount: number;
    poCount: number;
  };
  recentPos: { id: string; poNumber: string; vendor: string; total: number; status: string }[];
  recentInvoices: { id: string; invoiceNumber: string; total: number; status: string }[];
  recentActivity: { action: string; entityType: string; createdAt: string }[];
}

const CARDS: { key: keyof Summary['cards']; label: string; money?: boolean }[] = [
  { key: 'activeRfqs', label: 'Active RFQs' },
  { key: 'pendingApprovals', label: 'Pending Approvals' },
  { key: 'openInvoices', label: 'Open Invoices' },
  { key: 'totalSpend', label: 'Total Spend', money: true },
  { key: 'vendorCount', label: 'Vendors' },
  { key: 'poCount', label: 'Purchase Orders' },
];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Summary>('/dashboard/summary'),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return <Spinner className="h-8 w-8" />;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live overview of your procurement activity." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <div key={c.key} className="card">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">
              {c.money ? money(data.cards[c.key]) : data.cards[c.key]}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-semibold">Recent Purchase Orders</h3>
          {!data.recentPos.length && <p className="text-sm text-slate-400">No purchase orders yet.</p>}
          <div className="space-y-2">
            {data.recentPos.map((p) => (
              <Link
                key={p.id}
                href="/purchase-orders"
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-medium">{p.poNumber}</div>
                  <div className="text-xs text-slate-400">{p.vendor}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{money(p.total)}</span>
                  <StatusBadge status={p.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold">Recent Activity</h3>
          {!data.recentActivity.length && <p className="text-sm text-slate-400">No activity yet.</p>}
          <ul className="space-y-2">
            {data.recentActivity.map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {a.action.replace(/_/g, ' ')} · {a.entityType}
                </span>
                <span className="text-xs text-slate-400">{dateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
