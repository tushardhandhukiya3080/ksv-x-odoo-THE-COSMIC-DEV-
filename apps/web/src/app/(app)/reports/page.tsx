'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Spinner, StatusBadge } from '@/components/ui';

interface Spend { paid: number; outstanding: number; totalInvoices: number }
interface VendorReport {
  id: string;
  name: string;
  rating: number;
  status: string;
  quotations: number;
  purchaseOrders: number;
  spend: number;
}
interface Trend { month: string; spend: number; count: number }

export default function ReportsPage() {
  const { data: spend } = useQuery({ queryKey: ['reports', 'spend'], queryFn: () => api.get<Spend>('/reports/spend') });
  const { data: vendors } = useQuery({ queryKey: ['reports', 'vendors'], queryFn: () => api.get<VendorReport[]>('/reports/vendors') });
  const { data: trends } = useQuery({ queryKey: ['reports', 'trends'], queryFn: () => api.get<Trend[]>('/reports/trends') });

  const maxSpend = Math.max(1, ...(trends?.map((t) => t.spend) ?? [1]));

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Spend, vendor performance, and trends."
        action={
          <a href={api.fileUrl('/reports/export')} className="btn-ghost" target="_blank" rel="noreferrer">
            ⬇ Export CSV
          </a>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-400">Paid</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{money(spend?.paid ?? 0)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-400">Outstanding</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{money(spend?.outstanding ?? 0)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total invoices</div>
          <div className="mt-2 text-2xl font-bold">{spend?.totalInvoices ?? 0}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-semibold">Monthly procurement trend</h3>
          {!trends?.length ? (
            <Spinner />
          ) : (
            <div className="flex h-48 items-end gap-3">
              {trends.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-brand-500"
                    style={{ height: `${(t.spend / maxSpend) * 100}%`, minHeight: t.spend > 0 ? '4px' : '0' }}
                    title={money(t.spend)}
                  />
                  <span className="text-[10px] text-slate-400">{t.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 font-semibold">Vendor performance</h3>
          {!vendors?.length ? (
            <Spinner />
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="th">Vendor</th>
                  <th className="th">Rating</th>
                  <th className="th">POs</th>
                  <th className="th">Spend</th>
                </tr>
              </thead>
              <tbody>
                {vendors.slice(0, 8).map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">
                      <span className="font-medium">{v.name}</span>{' '}
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="td">★ {v.rating.toFixed(1)}</td>
                    <td className="td">{v.purchaseOrders}</td>
                    <td className="td font-semibold">{money(v.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
