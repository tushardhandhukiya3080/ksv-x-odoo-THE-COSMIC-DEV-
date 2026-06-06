'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VendorStatus, Paginated } from '@vendorbridge/shared';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { PageHeader, Spinner, StatusBadge, EmptyState, Modal } from '@/components/ui';

interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  status: VendorStatus;
  rating: number;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  createdAt: string;
}
interface Category {
  id: string;
  name: string;
}

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  gstin: '',
  address: '',
  categoryId: '',
  status: VendorStatus.ACTIVE as VendorStatus,
};

export default function VendorsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', q, status],
    queryFn: () =>
      api.get<Paginated<Vendor>>(
        `/vendors?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`,
      ),
  });
  const { data: categories } = useQuery({
    queryKey: ['vendor-categories'],
    queryFn: () => api.get<Category[]>('/vendor-categories'),
  });

  const save = useMutation({
    mutationFn: (payload: typeof form) => {
      const body = {
        ...payload,
        categoryId: payload.categoryId || undefined,
        gstin: payload.gstin || undefined,
        phone: payload.phone || undefined,
        address: payload.address || undefined,
      };
      return editing ? api.patch(`/vendors/${editing.id}`, body) : api.post('/vendors', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      closeModal();
    },
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/vendors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setError('');
    setModal(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      email: v.email,
      phone: v.phone ?? '',
      gstin: v.gstin ?? '',
      address: '',
      categoryId: v.categoryId ?? '',
      status: v.status,
    });
    setError('');
    setModal(true);
  };
  const closeModal = () => setModal(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Manage your supplier directory."
        action={
          <button className="btn-primary" onClick={openCreate}>
            + Add vendor
          </button>
        }
      />

      <div className="mb-4 flex gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search name, email, GSTIN…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="BLACKLISTED">Blacklisted</option>
        </select>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="p-8">
            <Spinner />
          </div>
        ) : !data?.data.length ? (
          <div className="p-6">
            <EmptyState title="No vendors found" hint="Add your first vendor to get started." />
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <th className="th">Name</th>
                <th className="th">Category</th>
                <th className="th">GSTIN</th>
                <th className="th">Rating</th>
                <th className="th">Status</th>
                <th className="th">Added</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((v) => (
                <tr key={v.id} className="border-b border-slate-50 last:border-0">
                  <td className="td">
                    <div className="font-medium text-slate-900">{v.name}</div>
                    <div className="text-xs text-slate-400">{v.email}</div>
                  </td>
                  <td className="td">{v.category?.name ?? '—'}</td>
                  <td className="td font-mono text-xs">{v.gstin ?? '—'}</td>
                  <td className="td">{v.rating ? `★ ${v.rating.toFixed(1)}` : '—'}</td>
                  <td className="td">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="td text-xs text-slate-400">{date(v.createdAt)}</td>
                  <td className="td text-right">
                    <button onClick={() => openEdit(v)} className="text-sm font-medium text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button
                      onClick={() => confirm(`Remove ${v.name}?`) && remove.mutate(v.id)}
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modal} onClose={closeModal} title={editing ? 'Edit vendor' : 'Add vendor'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            save.mutate(form);
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">GSTIN</label>
              <input className="input font-mono" value={form.gstin} onChange={set('gstin')} placeholder="15-char" />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.categoryId} onChange={set('categoryId')}>
                <option value="">None</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button className="btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add vendor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
