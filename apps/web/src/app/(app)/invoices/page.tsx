'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Role } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { money, date } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader, Spinner, StatusBadge, EmptyState } from '@/components/ui';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  currency: string;
  status: string;
  createdAt: string;
  po: { vendor: { name: string } };
  payments: { status: string }[];
}

interface PayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  simulated: boolean;
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function InvoicesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;

  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<InvoiceRow[]>('/invoices'),
  });

  const send = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const pay = useMutation({
    mutationFn: (id: string) => api.post<PayOrder>(`/invoices/${id}/pay`),
    onSuccess: async (order, id) => {
      if (order.simulated) {
        alert(
          'Razorpay keys are not configured — a simulated order was created.\nConfigure RAZORPAY_KEY_ID/SECRET and a webhook to complete real payments.',
        );
        return;
      }
      const ok = await loadRazorpay();
      if (!ok) {
        alert('Could not load Razorpay checkout (offline?).');
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'VendorBridge',
        description: 'Invoice payment',
        handler: () => {
          // Payment confirmation arrives server-side via webhook.
          setTimeout(() => qc.invalidateQueries({ queryKey: ['invoices'] }), 2000);
        },
      });
      rzp.open();
    },
  });

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Generated invoices, PDFs, and payments." />

      <div className="card p-0">
        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : !data?.length ? (
          <div className="p-6"><EmptyState title="No invoices yet" hint="Generate an invoice from a purchase order." /></div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Invoice</th>
                <th className="th">Vendor</th>
                <th className="th">Total</th>
                <th className="th">Status</th>
                <th className="th">Created</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                  <td className="td font-mono text-sm">{inv.invoiceNumber}</td>
                  <td className="td">{inv.po.vendor.name}</td>
                  <td className="td font-semibold">{money(Number(inv.grandTotal), inv.currency)}</td>
                  <td className="td"><StatusBadge status={inv.status} /></td>
                  <td className="td text-xs text-slate-400">{date(inv.createdAt)}</td>
                  <td className="td text-right">
                    <a
                      href={api.fileUrl(`/invoices/${inv.id}/pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      PDF
                    </a>
                    {canManage && inv.status === 'DRAFT' && (
                      <button onClick={() => send.mutate(inv.id)} className="ml-3 text-sm font-medium text-blue-600 hover:underline">
                        Send
                      </button>
                    )}
                    {canManage && inv.status !== 'PAID' && (
                      <button onClick={() => pay.mutate(inv.id)} disabled={pay.isPending} className="ml-3 text-sm font-medium text-emerald-600 hover:underline">
                        Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
