import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { apiKeys } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { randomToken, sha256 } from '@/lib/secretBox';

/**
 * Company API keys — for Zapier, Make, n8n or a website form posting into
 * this company's account (POST /api/hooks/leads). A key is shown once,
 * when it's made; only its sha256 is kept, so a lost key is revoked and
 * replaced, never recovered.
 */

export const KEY_PREFIX = 'tc_live_';
export const MAX_ACTIVE_KEYS = 20;

export class ApiKeyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function createApiKey(tenantId: string, name: string, actor: Actor) {
  const label = name.trim().slice(0, 80);
  if (!label) throw new ApiKeyError('Give the key a name, like "Zapier" or "Website form".');
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) throw new ApiKeyError(`A company can have ${MAX_ACTIVE_KEYS} active keys. Revoke one you no longer use first.`);

  const key = randomToken(KEY_PREFIX, 24);
  const id = crypto.randomUUID();
  await db.insert(apiKeys).values({
    id,
    tenantId,
    name: label,
    prefix: key.slice(0, KEY_PREFIX.length + 4),
    keyHash: sha256(key),
    createdByUserId: actor?.id ?? null,
  });
  await logChange({ tenantId, actor, entityType: 'api_key', entityId: id, action: 'created', summary: `Created API key "${label}"` });
  return { id, key };
}

export async function listApiKeys(tenantId: string) {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.tenantId, tenantId)).orderBy(desc(apiKeys.createdAt));
  return rows.map(({ keyHash: _hash, ...rest }) => rest);
}

export async function revokeApiKey(tenantId: string, id: string, actor: Actor) {
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId))).limit(1);
  if (!row) throw new ApiKeyError('Not found', 404);
  if (row.revokedAt) return;
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  await logChange({ tenantId, actor, entityType: 'api_key', entityId: id, action: 'revoked', summary: `Revoked API key "${row.name}"` });
}

/**
 * Which company an incoming request's key belongs to. Accepts
 * "Authorization: Bearer <key>" or "X-Api-Key: <key>". Null for a missing,
 * unknown or revoked key.
 */
export async function authenticateApiKey(req: Request): Promise<{ tenantId: string; keyId: string } | null> {
  const auth = req.headers.get('authorization') ?? '';
  const raw = (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : req.headers.get('x-api-key') ?? '').trim();
  if (!raw.startsWith(KEY_PREFIX) || raw.length > 200) return null;
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, sha256(raw))).limit(1);
  if (!row || row.revokedAt) return null;
  // At most one write a minute per key, so a busy Zap doesn't write on every call.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => undefined);
  }
  return { tenantId: row.tenantId, keyId: row.id };
}
