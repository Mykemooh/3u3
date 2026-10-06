import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { ledgerFor } from '@/lib/billing/wallet';

const LABEL: Record<string, string> = { SMS: 'Texts', VOICE: 'Tex phone minutes', PHONE_NUMBER: 'Business number', SETUP_FEE: 'Texting setup', TOPUP: 'Credits added', MANUAL: 'Adjustment' };

/** Credit history as a CSV (Settings → Plan & credits → Download). */
export async function GET() {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const rows = await ledgerFor(tenantId, 5000);
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'What', 'Type', 'Quantity', 'Amount (USD)', 'Balance after (USD)', 'Note'].map(esc).join(','),
    ...rows.map((r) =>
      [r.createdAt.toISOString(), LABEL[r.reason] ?? r.reason, r.type, r.quantity, (r.amountCents / 100).toFixed(2), (r.balanceAfterCents / 100).toFixed(2), r.note ?? ''].map(esc).join(','),
    ),
  ];
  return new NextResponse(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="trashcan-credits.csv"' },
  });
}
