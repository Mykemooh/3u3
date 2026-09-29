import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TeamError } from '@/lib/team';
import { DispatchError } from '@/lib/dispatch';

/** The signed-in admin's tenant, or null (caller returns 403). */
export async function adminTenant(): Promise<string | null> {
  const user = (await getServerSession(authOptions))?.user as { role?: string; tenantId?: string } | undefined;
  return user?.role === 'ADMIN' && user.tenantId ? user.tenantId : null;
}

export const forbidden = () => NextResponse.json({ error: 'Admin only' }, { status: 403 });

/** Team/dispatch errors become their message; anything else is a logged 500. */
export function teamApiError(err: unknown) {
  if (err instanceof TeamError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof DispatchError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
