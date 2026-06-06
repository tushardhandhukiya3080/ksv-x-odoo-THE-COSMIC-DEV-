'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { date, daysUntil } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { Role } from '@vendorbridge/shared';
import { PageHeader, Spinner, StatusBadge, EmptyState, Modal } from '@/components/ui';

interface RfqRow {
  id: string;
  title: string;
  status: string;
  deadline: string;
  createdAt: string;
  _count: { invitations: number; quotations: number };
}

type LineItem = { name: string; quantity: number; unit: string; description?: string };

export default function RfqsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const canCreate = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', deadline: '' });
  const [items, setItems] = useState<LineItem[]>([{ name: '', quantity: 1, unit: 'pcs' }]);

  const { data, isLoading } = useQuery({
    queryKey: ['rfqs'],
    queryFn: () => api.get<RfqRow[]>('/rfqs'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/rfqs', {
        title: form.title,
        description: form.description || undefined,
        deadline: new Date(form.deadline).toISOString(),
        items: items.map((i) => ({ ...i, quantity: Number(i.quantity) })),
      }),
    onSuccess: (rfq) => {
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      setModal(false);
      router.push(`/rfqs/${rfq.id}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  const addItem = () => setItems([...items, { name: '', quantity: 1, unit: 'pcs' }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, k: keyof LineItem, v: string) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  return (
    <div>
      <PageHeader
        title="Requests for Quotation"
        subtitle="Raise RFQs, invite vendors, compare quotes."
        action={
          canCreate && (
            <button className="btn-primary" onClick={() => { setModal(true); setError(''); }}>
              + New RFQ
            </button>
          )
        }
      />

      <div className="card p-0">
        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : !data?.length ? (
          <div className="p-6"><EmptyState title="No RFQs yet" hint="Create your first RFQ." /></div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Title</th>
                <th className="th">Status</th>
                <th className="th">Invited</th>
                <th className="th">Quotes</th>
                <th className="th">Deadline</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const d = daysUntil(r.deadline);
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="td">
                      <Link href={`/rfqs/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                        {r.title}
                      </Link>
                    </td>
                    <td className="td"><StatusBadge status={r.status} /></td>
                    <td className="td">{r._count.invitations}</td>
                    <td className="td">{r._count.quotations}</td>
                    <td className="td">
                      <span className={d < 0 ? 'text-red-600' : d <= 3 ? 'text-amber-600' : ''}>
                        {date(r.deadline)} {d >= 0 ? `(${d}d)` : '(passed)'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <Link href={`/rfqs/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New RFQ">
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate(); }}
          className="space-y-3"
        >
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Deadline</label>
            <input className="input" type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} required />
          </div>

          <div>
            <label className="label">Line items</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <input className="input flex-1" placeholder="Item name" value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} required />
                  <input className="input w-20" type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} required />
                  <input className="input w-20" placeholder="unit" value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} required />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="px-2 text-red-500">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-2 text-sm font-medium text-brand-600">
              + Add item
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create RFQ'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
