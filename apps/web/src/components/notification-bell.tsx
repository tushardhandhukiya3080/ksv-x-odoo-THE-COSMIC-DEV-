'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: count } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 20_000,
  });

  const { data: list } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
      >
        <span className="text-lg">🔔</span>
        {(count?.count ?? 0) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count!.count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
            Notifications
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!list?.length && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications</p>
            )}
            {list?.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.readAt && markRead.mutate(n.id)}
                className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                  n.readAt ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">{n.title}</span>
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>
                <p className="mt-1 text-[10px] text-slate-400">{dateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
