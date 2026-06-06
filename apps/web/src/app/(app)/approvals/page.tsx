'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { PageHeader, Spinner, StatusBadge, EmptyState, Modal } from '@/components/ui';

interface Approval {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  currentStep: number;
  createdAt: string;
  steps: {
    id: string;
    order: number;
    decision: string;
    remarks: string | null;
    approver: { name: string };
  }[];
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [decisionFor, setDecisionFor] = useState<{ id: string; decision: string } | null>(null);
  const [remarks, setRemarks] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<Approval[]>('/approvals/pending'),
    refetchInterval: 20_000,
  });

  const decide = useMutation({
    mutationFn: () =>
      api.post(`/approvals/${decisionFor!.id}/decision`, {
        decision: decisionFor!.decision,
        remarks: remarks || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setDecisionFor(null);
      setRemarks('');
    },
  });

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Quotations awaiting your decision." />

      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <EmptyState title="Nothing pending" hint="You're all caught up." />
      ) : (
        <div className="space-y-4">
          {data.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.subjectType}</span>
                    <StatusBadge status={a.status} />
                    <span className="text-xs text-slate-400">step {a.currentStep}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Requested {dateTime(a.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => setDecisionFor({ id: a.id, decision: 'APPROVED' })}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => setDecisionFor({ id: a.id, decision: 'REJECTED' })}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {a.steps.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium">{s.approver.name}</span>
                    <StatusBadge status={s.decision} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={decisionFor !== null}
        onClose={() => setDecisionFor(null)}
        title={decisionFor?.decision === 'APPROVED' ? 'Approve' : 'Reject'}
      >
        <div className="space-y-3">
          <div>
            <label className="label">Remarks (optional)</label>
            <textarea className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDecisionFor(null)}>
              Cancel
            </button>
            <button
              className={decisionFor?.decision === 'APPROVED' ? 'btn-primary' : 'btn-danger'}
              disabled={decide.isPending}
              onClick={() => decide.mutate()}
            >
              {decide.isPending ? 'Submitting…' : `Confirm ${decisionFor?.decision.toLowerCase()}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
