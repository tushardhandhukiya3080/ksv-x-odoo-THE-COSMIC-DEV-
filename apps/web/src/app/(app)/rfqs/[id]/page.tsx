'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Role, AiAnalysis } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { money, date, daysUntil } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader, Spinner, StatusBadge, Modal } from '@/components/ui';

interface RfqDetail {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  status: string;
  items: { id: string; name: string; quantity: number; unit: string }[];
  invitations: { id: string; status: string; token: string; vendor: { id: string; name: string; email: string } }[];
  quotations: { id: string; vendorId: string; status: string }[];
}
interface Comparison {
  quotations: {
    quotationId: string;
    vendor: { id: string; name: string; rating: number };
    deliveryDays: number;
    currency: string;
    total: number;
    isLowest: boolean;
    isFastest: boolean;
  }[];
  summary: { lowestTotal: number; fastestDeliveryDays: number; count: number };
}
interface AiResult { source: string; cached: boolean; analysis: AiAnalysis }
interface VendorLite { id: string; name: string }
interface UserLite { id: string; name: string; email: string }

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [approveFor, setApproveFor] = useState<string | null>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: rfq, isLoading } = useQuery({
    queryKey: ['rfq', id],
    queryFn: () => api.get<RfqDetail>(`/rfqs/${id}`),
  });
  const { data: comparison } = useQuery({
    queryKey: ['rfq', id, 'comparison'],
    queryFn: () => api.get<Comparison>(`/rfqs/${id}/comparison`),
  });
  const { data: vendors } = useQuery({
    queryKey: ['vendors', 'lite'],
    queryFn: () => api.get<{ data: VendorLite[] }>('/vendors?pageSize=100'),
    enabled: inviteOpen,
  });
  const { data: approvers } = useQuery({
    queryKey: ['users', 'approvers'],
    queryFn: () => api.get<UserLite[]>('/users?role=APPROVER'),
    enabled: approveFor !== null,
  });

  const invite = useMutation({
    mutationFn: () => api.post(`/rfqs/${id}/invite`, { vendorIds: selectedVendors }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfq', id] });
      setInviteOpen(false);
      setSelectedVendors([]);
    },
  });

  const runAi = useMutation({
    mutationFn: () => api.post<AiResult>(`/rfqs/${id}/ai-analysis`),
    onSuccess: setAi,
  });

  const requestApproval = useMutation({
    mutationFn: () =>
      api.post('/approvals', {
        subjectType: 'QUOTATION',
        subjectId: approveFor,
        approverIds: selectedApprovers,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfq', id] });
      setApproveFor(null);
      setSelectedApprovers([]);
    },
  });

  const generatePo = useMutation({
    mutationFn: (quotationId: string) => api.post<{ id: string }>('/purchase-orders', { quotationId }),
    onSuccess: () => router.push('/purchase-orders'),
  });

  if (isLoading || !rfq) return <Spinner className="h-8 w-8" />;

  const recommendedId = ai?.analysis.recommendedQuotationId;
  const copyLink = (token: string) => {
    const link = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <PageHeader
        title={rfq.title}
        subtitle={rfq.description ?? undefined}
        action={<StatusBadge status={rfq.status} />}
      />

      <div className="mb-2 text-sm text-slate-500">
        Deadline: {date(rfq.deadline)}{' '}
        <span className={daysUntil(rfq.deadline) < 0 ? 'text-red-600' : ''}>
          ({daysUntil(rfq.deadline) >= 0 ? `${daysUntil(rfq.deadline)} days left` : 'passed'})
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items */}
        <div className="card lg:col-span-1">
          <h3 className="mb-3 font-semibold">Line items</h3>
          <ul className="space-y-2">
            {rfq.items.map((it) => (
              <li key={it.id} className="flex justify-between text-sm">
                <span>{it.name}</span>
                <span className="text-slate-400">
                  {it.quantity} {it.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Invitations */}
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Invited vendors</h3>
            {canManage && (
              <button className="btn-ghost" onClick={() => setInviteOpen(true)}>
                + Invite vendors
              </button>
            )}
          </div>
          {!rfq.invitations.length ? (
            <p className="text-sm text-slate-400">No vendors invited yet.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {rfq.invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">
                      <div className="font-medium">{inv.vendor.name}</div>
                      <div className="text-xs text-slate-400">{inv.vendor.email}</div>
                    </td>
                    <td className="td"><StatusBadge status={inv.status} /></td>
                    <td className="td text-right">
                      <button onClick={() => copyLink(inv.token)} className="text-sm font-medium text-brand-600 hover:underline">
                        {copied === inv.token ? 'Copied!' : 'Copy portal link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Comparison + AI */}
      <div className="card mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Quotation comparison</h3>
          <button className="btn-primary" onClick={() => runAi.mutate()} disabled={runAi.isPending || !comparison?.quotations.length}>
            {runAi.isPending ? 'Analyzing…' : '✨ AI recommendation'}
          </button>
        </div>

        {!comparison?.quotations.length ? (
          <p className="text-sm text-slate-400">No submitted quotations yet.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Vendor</th>
                <th className="th">Rating</th>
                <th className="th">Delivery</th>
                <th className="th">Total</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {comparison.quotations.map((q) => (
                <tr
                  key={q.quotationId}
                  className={`border-b border-slate-50 last:border-0 ${
                    recommendedId === q.quotationId ? 'bg-brand-50' : ''
                  }`}
                >
                  <td className="td">
                    <span className="font-medium">{q.vendor.name}</span>
                    {recommendedId === q.quotationId && (
                      <span className="badge ml-2 bg-brand-100 text-brand-700">AI pick</span>
                    )}
                  </td>
                  <td className="td">★ {q.vendor.rating.toFixed(1)}</td>
                  <td className="td">
                    {q.deliveryDays}d {q.isFastest && <span className="badge bg-emerald-100 text-emerald-700">fastest</span>}
                  </td>
                  <td className="td font-semibold">
                    {money(q.total, q.currency)}{' '}
                    {q.isLowest && <span className="badge bg-emerald-100 text-emerald-700">lowest</span>}
                  </td>
                  <td className="td text-right">
                    {canManage && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setApproveFor(q.quotationId)} className="text-sm font-medium text-brand-600 hover:underline">
                          Request approval
                        </button>
                        {rfq.status === 'AWARDED' && (
                          <button onClick={() => generatePo.mutate(q.quotationId)} className="text-sm font-medium text-emerald-600 hover:underline">
                            Generate PO
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {ai && (
          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-semibold text-brand-700">AI Recommendation</span>
              <span className="badge bg-white text-slate-500">
                {ai.source === 'deterministic-fallback' ? 'deterministic (LLM offline)' : ai.source}
                {ai.cached ? ' · cached' : ''}
              </span>
            </div>
            <p className="text-sm text-slate-700">{ai.analysis.summary}</p>
            {ai.analysis.ranking.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {ai.analysis.ranking.map((r) => (
                  <li key={r.quotationId}>
                    Score {r.score} — {r.rationale}
                  </li>
                ))}
              </ul>
            )}
            {ai.analysis.riskFlags.length > 0 && (
              <div className="mt-2 text-xs text-red-600">
                {ai.analysis.riskFlags.map((f, i) => (
                  <div key={i}>⚠ {f.type}: {f.detail}</div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              Advisory only — a human approver still decides.
            </p>
          </div>
        )}
      </div>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite vendors">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {vendors?.data.map((v) => (
            <label key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedVendors.includes(v.id)}
                onChange={(e) =>
                  setSelectedVendors(
                    e.target.checked
                      ? [...selectedVendors, v.id]
                      : selectedVendors.filter((x) => x !== v.id),
                  )
                }
              />
              <span className="text-sm">{v.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setInviteOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={!selectedVendors.length || invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? 'Inviting…' : `Invite ${selectedVendors.length}`}
          </button>
        </div>
      </Modal>

      {/* Approval modal */}
      <Modal open={approveFor !== null} onClose={() => setApproveFor(null)} title="Request approval">
        <p className="mb-3 text-sm text-slate-500">Select approver(s) for this quotation.</p>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {approvers?.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedApprovers.includes(a.id)}
                onChange={(e) =>
                  setSelectedApprovers(
                    e.target.checked
                      ? [...selectedApprovers, a.id]
                      : selectedApprovers.filter((x) => x !== a.id),
                  )
                }
              />
              <span className="text-sm">{a.name} <span className="text-slate-400">({a.email})</span></span>
            </label>
          ))}
          {approvers && !approvers.length && (
            <p className="text-sm text-slate-400">No approver users found. Add an Approver in your org.</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setApproveFor(null)}>Cancel</button>
          <button className="btn-primary" disabled={!selectedApprovers.length || requestApproval.isPending} onClick={() => requestApproval.mutate()}>
            {requestApproval.isPending ? 'Submitting…' : 'Request approval'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
