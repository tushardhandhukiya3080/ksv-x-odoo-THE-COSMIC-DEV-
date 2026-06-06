'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShipMode, Role } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader, Spinner, StatusBadge, EmptyState, Modal } from '@/components/ui';

interface ShipmentRow {
  id: string;
  mode: string;
  status: string;
  originName: string;
  destName: string;
  etaAt: string | null;
  po: { poNumber: string; vendor: { name: string } };
}
interface PoRow { id: string; poNumber: string; vendor: { name: string } }

const MODE_ICON: Record<string, string> = { LAND: '🚚', AIR: '✈️', SEA: '🚢' };

const CITIES: Record<string, [number, number]> = {
  'Mumbai': [19.076, 72.8777],
  'Delhi': [28.7041, 77.1025],
  'Chennai': [13.0827, 80.2707],
  'Kolkata': [22.5726, 88.3639],
  'Bengaluru': [12.9716, 77.5946],
  'Singapore': [1.3521, 103.8198],
  'Dubai': [25.2048, 55.2708],
  'Rotterdam': [51.9244, 4.4777],
  'Shanghai': [31.2304, 121.4737],
  'Hamburg': [53.5511, 9.9937],
};

export default function ShipmentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ poId: '', mode: ShipMode.SEA as string, carrier: '', origin: 'Shanghai', dest: 'Mumbai' });

  const { data, isLoading } = useQuery({
    queryKey: ['shipments'],
    queryFn: () => api.get<ShipmentRow[]>('/shipments'),
  });
  const { data: pos } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get<PoRow[]>('/purchase-orders'),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => {
      const [oLat, oLng] = CITIES[form.origin];
      const [dLat, dLng] = CITIES[form.dest];
      return api.post('/shipments', {
        poId: form.poId,
        mode: form.mode,
        carrier: form.carrier || undefined,
        originName: form.origin, originLat: oLat, originLng: oLng,
        destName: form.dest, destLat: dLat, destLng: dLng,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); setOpen(false); },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div>
      <PageHeader
        title="Shipments"
        subtitle="Track multi-modal deliveries on the map."
        action={canManage && <button className="btn-primary" onClick={() => { setOpen(true); setError(''); }}>+ New shipment</button>}
      />
      <div className="card p-0">
        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : !data?.length ? (
          <div className="p-6"><EmptyState title="No shipments yet" hint="Create a shipment from a purchase order." /></div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">PO</th><th className="th">Mode</th><th className="th">Route</th>
                <th className="th">Status</th><th className="th">ETA</th><th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="td font-mono text-sm">{s.po.poNumber}</td>
                  <td className="td">{MODE_ICON[s.mode]} {s.mode}</td>
                  <td className="td text-sm text-slate-600">{s.originName.split(',')[0]} → {s.destName.split(',')[0]}</td>
                  <td className="td"><StatusBadge status={s.status} /></td>
                  <td className="td text-xs text-slate-400">{date(s.etaAt)}</td>
                  <td className="td text-right">
                    <Link href={`/shipments/${s.id}`} className="text-sm font-medium text-brand-600 hover:underline">Track →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New shipment">
        <form onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate(); }} className="space-y-3">
          <div>
            <label className="label">Purchase order</label>
            <select className="input" value={form.poId} onChange={(e) => setForm({ ...form, poId: e.target.value })} required>
              <option value="">Select a PO…</option>
              {pos?.map((p) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendor.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mode</label>
              <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="SEA">Sea 🚢</option><option value="AIR">Air ✈️</option><option value="LAND">Land 🚚</option>
              </select>
            </div>
            <div>
              <label className="label">Carrier</label>
              <input className="input" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="e.g. Maersk" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Origin</label>
              <select className="input" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
                {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Destination</label>
              <select className="input" value={form.dest} onChange={(e) => setForm({ ...form, dest: e.target.value })}>
                {Object.keys(CITIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={create.isPending || !form.poId}>{create.isPending ? 'Creating…' : 'Create shipment'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
