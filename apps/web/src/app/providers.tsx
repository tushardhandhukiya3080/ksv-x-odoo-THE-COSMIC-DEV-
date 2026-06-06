'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { RealtimeSync } from '@/lib/realtime';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RealtimeSync />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
