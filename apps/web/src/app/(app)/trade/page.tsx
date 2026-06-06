'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Spinner, StatusBadge, EmptyState } from '@/components/ui';

interface TradeProfile { type: string; country: string; incotermsDefault: string | null; currencies: string[] }
interface OrgLite { id: string; name: string }
interface Connection { id: string; relationship: string; status: string; direction: string; counterpartyName: string }
interface Listing { id: string; title: string; description: string | null; priceFrom: number | null; currency: string; moq: number | null; hsCode: string | null; supplierName: string; isOwn: boolean }

export default function TradePage() {
  const qc = useQueryClient();

  const { data: profile } = useQuery({ queryKey: ['trade', 'profile'], queryFn: () => api.get<TradeProfile | null>('/trade/profile') });
  const { data: orgs } = useQuery({ queryKey: ['trade', 'orgs'], queryFn: () => api.get<OrgLite[]>('/trade/organizations') });
  const { data: connections } = useQuery({ queryKey: ['trade', 'connections'], queryFn: () => api.get<Connection[]>('/trade/connections') });
  const [q, setQ] = useState('');
  const { data: marketplace } = useQuery({ queryKey: ['trade', 'marketplace', q], queryFn: () => api.get<Listing[]>(`/trade/marketplace${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  const { data: mine } = useQuery({ queryKey: ['trade', 'listings'], queryFn: () => api.get<Listing[]>('/trade/listings') });

  // Profile form
  const [pf, setPf] = useState({ type: 'BOTH', country: 'India', incotermsDefault: 'FOB', currencies: 'USD,INR' });
  const putProfile = useMutation({
    mutationFn: () =>
      api.put('/trade/profile', {
        type: pf.type,
        country: pf.country,
        incotermsDefault: pf.incotermsDefault || undefined,
        currencies: pf.currencies.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trade', 'profile'] }),
  });

  // Connect
  const [connTo, setConnTo] = useState('');
  const [rel, setRel] = useState('B2B');
  const connect = useMutation({
    mutationFn: () => api.post('/trade/connections', { toOrgId: connTo, relationship: rel }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trade', 'connections'] }),
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.post(`/trade/connections/${id}/respond`, { accept }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trade', 'connections'] }),
  });

  // Listing
  const [lf, setLf] = useState({ title: '', priceFrom: '', currency: 'USD', moq: '', hsCode: '' });
  const createListing = useMutation({
    mutationFn: () => api.post('/trade/listings', {
      title: lf.title,
      priceFrom: lf.priceFrom ? Number(lf.priceFrom) : undefined,
      currency: lf.currency, moq: lf.moq ? Number(lf.moq) : undefined, hsCode: lf.hsCode || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trade'] }); setLf({ title: '', priceFrom: '', currency: 'USD', moq: '', hsCode: '' }); },
  });
  const delListing = useMutation({
    mutationFn: (id: string) => api.del(`/trade/listings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trade'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Global Trade" subtitle="Trade profile, B2B/P2P connections, and the supplier marketplace." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trade profile */}
        <div className="card">
          <h3 className="mb-3 font-semibold">Trade profile</h3>
          {profile && (
            <div className="mb-3 flex flex-wrap gap-2 text-sm text-slate-600">
              <span className="badge bg-brand-100 text-brand-700">{profile.type}</span>
              <span>📍 {profile.country}</span>
              {profile.incotermsDefault && <span>Incoterms: {profile.incotermsDefault}</span>}
              <span>{profile.currencies.join(', ')}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={pf.type} onChange={(e) => setPf({ ...pf, type: e.target.value })}>
              <option value="BUYER">Buyer</option><option value="SUPPLIER">Supplier</option><option value="BOTH">Both</option>
            </select>
            <input className="input" placeholder="Country" value={pf.country} onChange={(e) => setPf({ ...pf, country: e.target.value })} />
            <input className="input" placeholder="Incoterms (FOB)" value={pf.incotermsDefault} onChange={(e) => setPf({ ...pf, incotermsDefault: e.target.value })} />
            <input className="input" placeholder="Currencies (USD,INR)" value={pf.currencies} onChange={(e) => setPf({ ...pf, currencies: e.target.value })} />
          </div>
          <button className="btn-primary mt-3" disabled={putProfile.isPending} onClick={() => putProfile.mutate()}>
            {putProfile.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>

        {/* Connections */}
        <div className="card">
          <h3 className="mb-3 font-semibold">Connections</h3>
          <div className="mb-3 flex gap-2">
            <select className="input" value={connTo} onChange={(e) => setConnTo(e.target.value)}>
              <option value="">Select org…</option>
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="input w-24" value={rel} onChange={(e) => setRel(e.target.value)}>
              <option value="B2B">B2B</option><option value="P2P">P2P</option>
            </select>
            <button className="btn-ghost" disabled={!connTo || connect.isPending} onClick={() => connect.mutate()}>Request</button>
          </div>
          {!connections?.length ? (
            <p className="text-sm text-slate-400">No connections yet. {orgs?.length === 0 && 'Sign up a second organization to connect.'}</p>
          ) : (
            <ul className="space-y-2">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.counterpartyName} <span className="text-slate-400">({c.relationship} · {c.direction.toLowerCase()})</span></span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    {c.status === 'REQUESTED' && c.direction === 'INCOMING' && (
                      <>
                        <button className="text-xs font-medium text-emerald-600" onClick={() => respond.mutate({ id: c.id, accept: true })}>Accept</button>
                        <button className="text-xs font-medium text-red-600" onClick={() => respond.mutate({ id: c.id, accept: false })}>Reject</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* My listings */}
      <div className="card">
        <h3 className="mb-3 font-semibold">My marketplace listings</h3>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <input className="input" placeholder="Title" value={lf.title} onChange={(e) => setLf({ ...lf, title: e.target.value })} />
          <input className="input" placeholder="Price from" value={lf.priceFrom} onChange={(e) => setLf({ ...lf, priceFrom: e.target.value })} />
          <input className="input" placeholder="Currency" value={lf.currency} onChange={(e) => setLf({ ...lf, currency: e.target.value })} />
          <input className="input" placeholder="MOQ" value={lf.moq} onChange={(e) => setLf({ ...lf, moq: e.target.value })} />
          <input className="input" placeholder="HS code" value={lf.hsCode} onChange={(e) => setLf({ ...lf, hsCode: e.target.value })} />
        </div>
        <button className="btn-primary" disabled={!lf.title || createListing.isPending} onClick={() => createListing.mutate()}>
          {createListing.isPending ? 'Adding…' : '+ Add listing'}
        </button>
        {mine && mine.length > 0 && (
          <ul className="mt-3 space-y-1">
            {mine.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm">
                <span>{l.title} {l.priceFrom != null && <span className="text-slate-400">from {money(l.priceFrom, l.currency)}</span>}</span>
                <button className="text-xs text-red-600" onClick={() => delListing.mutate(l.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Marketplace */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Marketplace</h3>
          <input className="input max-w-xs" placeholder="Search title or HS code…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!marketplace?.length ? (
          <EmptyState title="No listings found" hint="Add a listing above, or sign up another org to populate the marketplace." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {marketplace.map((l) => (
              <div key={l.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between">
                  <h4 className="font-semibold">{l.title}</h4>
                  {l.isOwn && <span className="badge bg-slate-100 text-slate-500">yours</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">{l.supplierName}</p>
                {l.description && <p className="mt-2 text-sm text-slate-600">{l.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  {l.priceFrom != null && <span className="font-semibold text-slate-700">from {money(l.priceFrom, l.currency)}</span>}
                  {l.moq != null && <span>MOQ {l.moq}</span>}
                  {l.hsCode && <span>HS {l.hsCode}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
