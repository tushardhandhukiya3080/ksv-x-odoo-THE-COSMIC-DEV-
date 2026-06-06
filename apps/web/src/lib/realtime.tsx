'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@vendorbridge/shared';
import { tokenStore } from './api';
import { useAuth } from './auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

/**
 * Connects a Socket.io client (authenticated with the access token) once the user is
 * logged in, and invalidates the relevant TanStack Query caches on each event so the
 * UI updates live (Spec §7.3). Degrades silently if the socket can't connect.
 */
export function RealtimeSync() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const token = tokenStore.get();
    if (!token) return;

    const socket: Socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    const invalidate = (keys: string[]) =>
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, () => invalidate(['notifications']));
    socket.on(SOCKET_EVENTS.DASHBOARD_UPDATE, () => invalidate(['dashboard']));
    socket.on(SOCKET_EVENTS.QUOTATION_RECEIVED, () => invalidate(['rfq', 'rfqs', 'dashboard']));
    socket.on(SOCKET_EVENTS.APPROVAL_UPDATED, () =>
      invalidate(['approvals', 'rfq', 'rfqs', 'dashboard']),
    );
    socket.on(SOCKET_EVENTS.INVOICE_STATUS, () => invalidate(['invoices', 'dashboard']));
    socket.on(SOCKET_EVENTS.RFQ_INVITED, () => invalidate(['rfqs', 'notifications']));

    return () => {
      socket.disconnect();
    };
  }, [user, qc]);

  return null;
}
