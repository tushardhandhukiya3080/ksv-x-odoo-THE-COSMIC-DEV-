'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Role } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { dateTime, date } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader, Spinner, StatusBadge } from '@/components/ui';

const ShipmentMap = dynamic(() => import('@/components/shipment-map'), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl bg-slate-100"><Spinner /></div>,
});

interface Shipment {
  id: string;
  mode: string;
  carrier: string | null;
  trackingRef: string | null;
  status: string;
  originName: string;
  originLat: number;
  originLng: number;
  destName: string;
  destLat: number;
  destLng: number;
  currentLat: number | null;
  currentLng: number | null;
  etaAt: string | null;
  po: { poNumber: string; vendor: { name: string } };
  events: { id: string; status: string; note: string | null; lat: number | null; lng: number | null; occurredAt: string }[];
}

const STATUSES = ['PENDING', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'DELAYED'];

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.PROCUREMENT_OFFICER;
  const [status, setStatus] = useState('IN_TRANSIT');
  const [note, setNote] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const { data: s, isLoading } = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => api.get<Shipment>(`/shipments/${id}`),
    refetchInterval: 15_000,
  });

  const addEvent = useMutation({
    mutationFn: () =>
      api.post(`/shipments/${id}/events`, {
        status,
        note: note || undefined,
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', id] });
      setNote(''); setLat(''); setLng('');
    },
  });

  if (isLoading || !s) return <Spinner className="h-8 w-8" />;

  return (
    <div>
      <PageHeader
        title={`Shipment · PO ${s.po.poNumber}`}
        subtitle={`${s.mode} · ${s.carrier ?? 'carrier n/a'} · ${s.po.vendor.name}`}
        action={<StatusBadge status={s.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ShipmentMap
            origin={{ name: s.originName, lat: s.originLat, lng: s.originLng }}
            dest={{ name: s.destName, lat: s.destLat, lng: s.destLng }}
            current={s.currentLat != null && s.currentLng != null ? { lat: s.currentLat, lng: s.currentLng } : null}
          />
          <div className="mt-3 flex gap-6 text-sm">
            <span><span className="inline-block h-3 w-3 rounded-full bg-emerald-500 align-middle"></span> {s.originName.split(',')[0]}</span>
            <span><span className="inline-block h-3 w-3 rounded-full bg-red-500 align-middle"></span> {s.destName.split(',')[0]}</span>
            {s.etaAt && <span className="text-slate-500">ETA {date(s.etaAt)}</span>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-3 font-semibold">Status timeline</h3>
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-4">
              {s.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-brand-500 ring-2 ring-white" />
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    <span className="text-xs text-slate-400">{dateTime(e.occurredAt)}</span>
                  </div>
                  {e.note && <p className="mt-1 text-sm text-slate-600">{e.note}</p>}
                </li>
              ))}
            </ol>
          </div>

          {canManage && (
            <div className="card">
              <h3 className="mb-3 font-semibold">Add update</h3>
              <div className="space-y-2">
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
                </select>
                <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <input className="input" placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
                  <input className="input" placeholder="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
                <button className="btn-primary w-full" disabled={addEvent.isPending} onClick={() => addEvent.mutate()}>
                  {addEvent.isPending ? 'Saving…' : 'Post update'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
