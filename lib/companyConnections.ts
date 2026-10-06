import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { integrations } from '@/db/schema';
import { seal, unseal } from '@/lib/secretBox';
import { logChange, type Actor } from '@/lib/audit';

/**
 * Per-company OAuth connections (Xero, Gusto) in the integrations table
 * QuickBooks already uses — one row per company and provider. Tokens are
 * sealed at rest (lib/secretBox.ts).
 */

export type Provider = 'XERO' | 'GUSTO';
export type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number };

export async function getConnection(tenantId: string, provider: Provider) {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, provider))).limit(1);
  return row ?? null;
}

export async function saveConnection(tenantId: string, provider: Provider, tokens: TokenSet, externalAccountId: string | null, actor: Actor, label: string) {
  const existing = await getConnection(tenantId, provider);
  const values = {
    accessToken: seal(tokens.access_token),
    refreshToken: seal(tokens.refresh_token ?? unseal(existing?.refreshToken) ?? ''),
    externalAccountId,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000),
  };
  if (existing) await db.update(integrations).set(values).where(eq(integrations.id, existing.id));
  else await db.insert(integrations).values({ id: crypto.randomUUID(), tenantId, provider, ...values });
  await logChange({ tenantId, actor, entityType: 'integration', entityId: provider, action: 'connected', summary: `Connected ${label}` });
}

export async function updateTokens(id: string, tokens: TokenSet, currentRefresh: string) {
  await db
    .update(integrations)
    .set({ accessToken: seal(tokens.access_token), refreshToken: seal(tokens.refresh_token ?? currentRefresh), expiresAt: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000) })
    .where(eq(integrations.id, id));
}

export async function removeConnection(tenantId: string, provider: Provider, actor: Actor, label: string) {
  await db.delete(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, provider)));
  await logChange({ tenantId, actor, entityType: 'integration', entityId: provider, action: 'disconnected', summary: `Disconnected ${label}` });
}

/** A valid access token, refreshed through `refresh` when it's about to expire. */
export async function freshAccessToken(
  row: typeof integrations.$inferSelect,
  refresh: (refreshToken: string) => Promise<TokenSet>,
): Promise<string> {
  const access = unseal(row.accessToken);
  if (access && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) return access;
  const refreshToken = unseal(row.refreshToken);
  if (!refreshToken) throw new Error('Connection lost — connect again.');
  const tokens = await refresh(refreshToken);
  await updateTokens(row.id, tokens, refreshToken);
  return tokens.access_token;
}

/** OAuth state cookie helpers shared by the Connect routes. */
export const oauthCookie = (provider: Provider) => `${provider.toLowerCase()}_oauth_state`;
export function readCookie(req: Request, name: string) {
  return req.headers.get('cookie')?.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? null;
}
