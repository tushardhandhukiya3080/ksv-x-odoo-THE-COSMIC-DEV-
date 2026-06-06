'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Role } from '@vendorbridge/shared';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { NotificationBell } from '@/components/notification-bell';

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER] },
  { href: '/vendors', label: 'Vendors', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER] },
  { href: '/rfqs', label: 'RFQs', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER] },
  { href: '/approvals', label: 'Approvals', roles: [Role.ADMIN, Role.APPROVER] },
  { href: '/purchase-orders', label: 'Purchase Orders', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER] },
  { href: '/invoices', label: 'Invoices', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER] },
  { href: '/reports', label: 'Reports', roles: [Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const items = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="px-6 py-5 text-xl font-extrabold text-brand-600">VendorBridge</div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold text-slate-700">{user.name}</div>
          <div className="text-xs text-slate-400">{user.role.replace(/_/g, ' ')}</div>
          <button onClick={logout} className="mt-3 text-xs font-medium text-red-600 hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-8 py-3">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
