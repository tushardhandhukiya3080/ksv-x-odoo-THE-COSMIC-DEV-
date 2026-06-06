export const money = (n: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    n ?? 0,
  );

export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const daysUntil = (d: string | Date) => {
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
};
