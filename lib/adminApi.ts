import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TeamError } from '@/lib/team';
import { DispatchError } from '@/lib/dispatch';
import { headers } from 'next/headers';
import { permissionForPath, type AdminPermission } from '@/lib/permissions';
import { getUserRole, RoleError } from '@/lib/roles';

export type AdminSession = {
  tenantId: string;
  userId: string;
  name: string;
  permissions: Set<string>;
};

/**
 * The signed-in admin, if their role allows the permission this request's
 * path needs (lib/permissions.ts) — or the one passed explicitly. Null
 * means the caller returns 403. An admin still finishing MFA sign-in
 * (lib/mfa.ts) gets nothing here either.
 */
export async function adminSession(require?: AdminPermission): Promise<AdminSession | null> {
  const user = (await getServerSession(authOptions))?.user as
    | { role?: string; tenantId?: string; id?: string; name?: string; mfaPending?: boolean }
    | undefined;
  if (user?.role !== 'ADMIN' || !user.tenantId || !user.id) return null;
  if (user.mfaPending) return null;
  const { permissions } = await getUserRole(user.id);
  let needed: AdminPermission | null = require ?? null;
  if (!needed) {
    try {
      needed = permissionForPath(headers().get('x-3u3-path') ?? '');
    } catch {
      needed = null;
    }
  }
  if (needed && !permissions.has(needed)) return null;
  return { tenantId: user.tenantId, userId: user.id, name: user.name ?? 'Admin', permissions };
}

/** The signed-in admin's tenant, or null (caller returns 403). */
export async function adminTenant(): Promise<string | null> {
  return (await adminSession())?.tenantId ?? null;
}

/** The signed-in platform owner's user id, or null (caller returns 403) — SUPER_ADMIN, not a tenant's own ADMIN. */
export async function superAdminId(): Promise<string | null> {
  const user = (await getServerSession(authOptions))?.user as { role?: string; id?: string } | undefined;
  return user?.role === 'SUPER_ADMIN' && user.id ? user.id : null;
}

export const forbidden = () => NextResponse.json({ error: 'Admin only' }, { status: 403 });

/** Team/dispatch errors become their message; anything else is a logged 500. */
export function teamApiError(err: unknown) {
  if (err instanceof RoleError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof TeamError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof DispatchError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
