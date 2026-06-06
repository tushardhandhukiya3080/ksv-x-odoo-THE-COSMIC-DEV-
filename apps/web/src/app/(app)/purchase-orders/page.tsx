'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Role } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { money, date } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader, Spinner, StatusBadge, EmptyState } from '@/components/ui';

interface PoRow {
  id: string;
  poNumber: string;
  totalAmount: string;
  currency: string;
  status: string;
  issuedAt: string;
  vendor: { name: string };
  invoice: { id: string; status: string } | null;
}

export default function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<PoRow[]>('/purchase-orders'),
  });

  const createInvoice = useMutation({
    mutationFn: (poId: string) => api.post<{ id: string }>('/invoices', { poId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push('/invoices');
    },
  });

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle="Issued orders and their invoices." />

      <div className="card p-0">
        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : !data?.length ? (
          <div className="p-6"><EmptyState title="No purchase orders yet" hint="Approve a quotation and generate a PO from the RFQ." /></div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">PO Number</th>
                <th className="th">Vendor</th>
                <th className="th">Total</th>
                <th className="th">Status</th>
                <th className="th">Issued</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((po) => (
                <tr key={po.id} className="border-b border-slate-50 last:border-0">
                  <td className="td font-mono text-sm">{po.poNumber}</td>
                  <td className="td">{po.vendor.name}</td>
                  <td className="td font-semibold">{money(Number(po.totalAmount), po.currency)}</td>
                  <td className="td"><StatusBadge status={po.status} /></td>
                  <td className="td text-xs text-slate-400">{date(po.issuedAt)}</td>
                  <td className="td text-right">
                    <a
                      href={api.fileUrl(`/purchase-orders/${po.id}/pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      PDF
                    </a>
                    {canManage && (
                      po.invoice ? (
                        <span className="ml-3 text-sm text-slate-400">
                          Invoice <StatusBadge status={po.invoice.status} />
                        </span>
                      ) : (
                        <button
                          onClick={() => createInvoice.mutate(po.id)}
                          disabled={createInvoice.isPending}
                          className="ml-3 text-sm font-medium text-emerald-600 hover:underline"
                        >
                          Generate invoice
                        </button>
                      )
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
