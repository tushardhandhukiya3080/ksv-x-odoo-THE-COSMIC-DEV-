'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money, date, daysUntil } from '@/lib/format';
import { Spinner, StatusBadge } from '@/components/ui';

interface PortalData {
  rfq: {
    id: string;
    title: string;
    description: string | null;
    deadline: string;
    status: string;
    items: { id: string; name: string; quantity: number; unit: string; description: string | null }[];
  };
  vendor: { id: string; name: string };
  quotation: {
    id: string;
    deliveryDays: number;
    notes: string | null;
    items: { rfqItemId: string; unitPrice: string; taxRate: string }[];
  } | null;
  deadlinePassed: boolean;
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [taxes, setTaxes] = useState<Record<string, string>>({});
  const [deliveryDays, setDeliveryDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.get<PortalData>(`/portal/rfqs/${token}`),
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    if (data.quotation) {
      setSavedId(data.quotation.id);
      setDeliveryDays(String(data.quotation.deliveryDays));
      setNotes(data.quotation.notes ?? '');
      const p: Record<string, string> = {};
      const t: Record<string, string> = {};
      for (const it of data.quotation.items) {
        p[it.rfqItemId] = String(Number(it.unitPrice));
        t[it.rfqItemId] = String(Number(it.taxRate));
      }
      setPrices(p);
      setTaxes(t);
    }
  }, [data]);

  const buildItems = () =>
    data!.rfq.items.map((it) => ({
      rfqItemId: it.id,
      unitPrice: Number(prices[it.id] ?? 0),
      quantity: it.quantity,
      taxRate: taxes[it.id] !== undefined && taxes[it.id] !== '' ? Number(taxes[it.id]) : undefined,
    }));

  const saveDraft = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/portal/quotations', {
        token,
        deliveryDays: Number(deliveryDays),
        notes: notes || undefined,
        items: buildItems(),
      }),
    onSuccess: (q) => {
      setSavedId(q.id);
      setMessage('Draft saved.');
      setTimeout(() => setMessage(''), 2000);
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const q = await api.post<{ id: string }>('/portal/quotations', {
        token,
        deliveryDays: Number(deliveryDays),
        notes: notes || undefined,
        items: buildItems(),
      });
      return api.post(`/portal/quotations/${q.id}/submit`, { token });
    },
    onSuccess: () => {
      setMessage('Quotation submitted!');
      refetch();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Invitation not found</h1>
          <p className="mt-2 text-slate-500">This quotation link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const locked = data.deadlinePassed;
  const total = data.rfq.items.reduce((s, it) => {
    const price = Number(prices[it.id] ?? 0);
    const tax = taxes[it.id] ? Number(taxes[it.id]) : 18;
    return s + price * it.quantity * (1 + tax / 100);
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="text-xl font-extrabold text-brand-600">VendorBridge</div>
          <div className="text-sm text-slate-500">Vendor portal · {data.vendor.name}</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{data.rfq.title}</h1>
              {data.rfq.description && <p className="mt-1 text-sm text-slate-500">{data.rfq.description}</p>}
            </div>
            <StatusBadge status={data.rfq.status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Deadline: {date(data.rfq.deadline)}{' '}
            <span className={locked ? 'text-red-600' : ''}>
              ({locked ? 'passed' : `${daysUntil(data.rfq.deadline)} days left`})
            </span>
          </p>
        </div>

        {locked && (
          <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            The deadline has passed. This quotation can no longer be edited or submitted.
          </div>
        )}

        <div className="card mt-4">
          <h3 className="mb-4 font-semibold">Your pricing</h3>
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Item</th>
                <th className="th">Qty</th>
                <th className="th">Unit price</th>
                <th className="th">Tax %</th>
                <th className="th text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {data.rfq.items.map((it) => {
                const price = Number(prices[it.id] ?? 0);
                const tax = taxes[it.id] ? Number(taxes[it.id]) : 18;
                const line = price * it.quantity * (1 + tax / 100);
                return (
                  <tr key={it.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-slate-400">{it.unit}</div>
                    </td>
                    <td className="td">{it.quantity}</td>
                    <td className="td">
                      <input
                        className="input w-28"
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={locked}
                        value={prices[it.id] ?? ''}
                        onChange={(e) => setPrices({ ...prices, [it.id]: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input
                        className="input w-20"
                        type="number"
                        min={0}
                        max={100}
                        disabled={locked}
                        placeholder="18"
                        value={taxes[it.id] ?? ''}
                        onChange={(e) => setTaxes({ ...taxes, [it.id]: e.target.value })}
                      />
                    </td>
                    <td className="td text-right font-semibold">{money(line)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Delivery (days)</label>
              <input className="input" type="number" min={1} disabled={locked} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Estimated total</div>
              <div className="text-2xl font-bold text-brand-600">{money(total)}</div>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {message && <p className="mt-3 text-sm font-medium text-brand-600">{message}</p>}

          {!locked && (
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
                {saveDraft.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button className="btn-primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending ? 'Submitting…' : 'Submit quotation'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
