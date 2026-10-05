import { db } from '@/db/client';
import { kbArticles } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { HELP_ARTICLES, SECTIONS_ORDER, type Audience, type HelpArticle } from '@/lib/help/content';
import { logChange } from '@/lib/audit';

/**
 * The help center: the product's own articles (lib/help/content.ts) plus
 * each company's own (kb_articles), filtered to who is reading, and a
 * small keyword search that the help pages and Tex share.
 */

export type Article = HelpArticle & { source: 'PRODUCT' | 'COMPANY'; id: string };

/** Which audiences a reader can see. */
export function visibleTo(viewer: Audience): Audience[] {
  if (viewer === 'ADMIN') return ['PUBLIC', 'CLIENT', 'CREW', 'ADMIN'];
  if (viewer === 'CLIENT') return ['PUBLIC', 'CLIENT'];
  if (viewer === 'CREW') return ['PUBLIC', 'CREW'];
  return ['PUBLIC'];
}

export const fill = (text: string, company: string) => text.replace(/\{company\}/g, company);

export async function articlesFor(tenantId: string, viewer: Audience, company: string): Promise<Article[]> {
  const allowed = visibleTo(viewer);
  const own = await db
    .select()
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.published, true)))
    .orderBy(desc(kbArticles.createdAt));
  const companyArticles: Article[] = own
    .filter((a) => allowed.includes(a.audience))
    .map((a) => ({
      id: a.id,
      slug: `c-${a.id}`,
      title: a.title,
      kind: a.kind,
      audience: [a.audience],
      section: 'From ' + company,
      tags: (a.tags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      body: a.body,
      source: 'COMPANY' as const,
    }));
  const product: Article[] = HELP_ARTICLES.filter((a) => a.audience.some((x) => allowed.includes(x))).map((a) => ({
    ...a,
    id: a.slug,
    title: fill(a.title, company),
    body: fill(a.body, company),
    source: 'PRODUCT' as const,
  }));
  return [...companyArticles, ...product];
}

export function groupBySection(list: Article[]) {
  const sections = new Map<string, Article[]>();
  for (const a of list) sections.set(a.section, [...(sections.get(a.section) ?? []), a]);
  const order = (s: string) => (s.startsWith('From ') ? -1 : SECTIONS_ORDER.indexOf(s) === -1 ? 99 : SECTIONS_ORDER.indexOf(s));
  return Array.from(sections.entries()).sort((a, b) => order(a[0]) - order(b[0]));
}

const STOP = new Set(
  'a an and are as at be but by can do does for from have how i if in is it its me my of on or our so that the their them there this to us was we what when where which who why will with you your yours im ive dont'.split(' '),
);

export function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9$]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** Keyword search: tags count most, then title, then body. Company articles get a small lift. */
export function search(list: Article[], query: string, limit = 5) {
  const q = tokens(query);
  const lowerQuery = query.toLowerCase();
  if (!q.length) return [];
  const scored = list.map((a) => {
    const title = tokens(a.title);
    const body = tokens(a.body);
    let score = 0;
    for (const tag of a.tags) {
      if (tag.includes(' ') && lowerQuery.includes(tag)) score += 6;
    }
    for (const term of q) {
      if (a.tags.some((t) => t === term || t.split(/[\s-]+/).includes(term))) score += 4;
      if (title.includes(term)) score += 3;
      score += Math.min(3, body.filter((w) => w === term).length);
    }
    if (a.source === 'COMPANY') score *= 1.3;
    return { article: a, score };
  });
  return scored.filter((s) => s.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ----------------------------------------------------------------- editing

export const kbSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(10).max(8000),
  audience: z.enum(['PUBLIC', 'CLIENT', 'CREW', 'ADMIN']),
  kind: z.enum(['FAQ', 'SOP']),
  tags: z.string().max(300).optional(),
  published: z.boolean().default(true),
});
export type KbInput = z.infer<typeof kbSchema>;

export class KbError extends Error {
  status = 404;
}

export async function listCompanyArticles(tenantId: string) {
  return db.select().from(kbArticles).where(eq(kbArticles.tenantId, tenantId)).orderBy(desc(kbArticles.createdAt));
}

export async function saveArticle(tenantId: string, input: KbInput, actor: { id: string; name: string }, id?: string) {
  if (id) {
    const row = (await db.select().from(kbArticles).where(and(eq(kbArticles.id, id), eq(kbArticles.tenantId, tenantId))).limit(1))[0];
    if (!row) throw new KbError('Article not found.');
    await db.update(kbArticles).set({ ...input, tags: input.tags ?? null, updatedAt: new Date() }).where(eq(kbArticles.id, id));
    await logChange({ tenantId, actor, entityType: 'kb_article', entityId: id, action: 'updated', summary: `Edited help article “${input.title}”` });
    return id;
  }
  const newId = crypto.randomUUID();
  await db.insert(kbArticles).values({ id: newId, tenantId, ...input, tags: input.tags ?? null });
  await logChange({ tenantId, actor, entityType: 'kb_article', entityId: newId, action: 'created', summary: `Added help article “${input.title}”` });
  return newId;
}

export async function deleteArticle(tenantId: string, id: string, actor: { id: string; name: string }) {
  const row = (await db.select().from(kbArticles).where(and(eq(kbArticles.id, id), eq(kbArticles.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new KbError('Article not found.');
  await db.delete(kbArticles).where(eq(kbArticles.id, id));
  await logChange({ tenantId, actor, entityType: 'kb_article', entityId: id, action: 'deleted', summary: `Removed help article “${row.title}”` });
}
