import { db } from '@/db/client';
import { expenses, crews } from '@/db/schema';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { logChange } from '@/lib/audit';
import { z } from 'zod';

/**
 * Business expenses (Admin → Expenses): what the company spends, so the
 * Reports page can show profit, not just revenue. Supplies the crews
 * request still go through Admin → Supplies; recording what was bought
 * is here.
 */

export const EXPENSE_CATEGORIES = [
  'Cleaning supplies',
  'Equipment',
  'Fuel and mileage',
  // Added automatically when a crew drives a toll route (lib/trips.ts).
  'Tolls',
  'Vehicle',
  'Insurance',
  'Marketing',
  'Software',
  'Uniforms',
  'Training',
  'Rent and utilities',
  'Fees and licenses',
  'Other',
] as const;

export const expenseSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(EXPENSE_CATEGORIES),
  vendor: z.string().max(120).nullable().optional(),
  amountCents: z.number().int().positive().max(100_000_000),
  notes: z.string().max(1000).nullable().optional(),
  crewId: z.string().nullable().optional(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export class ExpenseError extends Error {
  status = 400;
}

export async function listExpenses(tenantId: string, from: string, to: string) {
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), gte(expenses.spentOn, from), lte(expenses.spentOn, to)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
}

async function checkCrew(tenantId: string, crewId: string | null | undefined) {
  if (!crewId) return null;
  const c = (await db.select().from(crews).where(and(eq(crews.id, crewId), eq(crews.tenantId, tenantId))).limit(1))[0];
  if (!c) throw new ExpenseError('That team isn’t yours.');
  return c.id;
}

export async function addExpense(tenantId: string, input: ExpenseInput, actor: { id: string; name: string }) {
  const id = crypto.randomUUID();
  await db.insert(expenses).values({
    id,
    tenantId,
    spentOn: input.spentOn,
    category: input.category,
    vendor: input.vendor?.trim() || null,
    amountCents: input.amountCents,
    notes: input.notes?.trim() || null,
    crewId: await checkCrew(tenantId, input.crewId),
    createdByUserId: actor.id,
  });
  await logChange({ tenantId, actor, entityType: 'expense', entityId: id, action: 'created', summary: `Recorded ${input.category.toLowerCase()} — $${(input.amountCents / 100).toFixed(2)}` });
  return id;
}

export async function updateExpense(tenantId: string, id: string, input: ExpenseInput, actor: { id: string; name: string }) {
  const row = (await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new ExpenseError('Expense not found.');
  await db
    .update(expenses)
    .set({
      spentOn: input.spentOn,
      category: input.category,
      vendor: input.vendor?.trim() || null,
      amountCents: input.amountCents,
      notes: input.notes?.trim() || null,
      crewId: await checkCrew(tenantId, input.crewId),
    })
    .where(eq(expenses.id, id));
  await logChange({ tenantId, actor, entityType: 'expense', entityId: id, action: 'updated', summary: `Edited ${input.category.toLowerCase()} — $${(input.amountCents / 100).toFixed(2)}` });
}

export async function deleteExpense(tenantId: string, id: string, actor: { id: string; name: string }) {
  const row = (await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new ExpenseError('Expense not found.');
  await db.delete(expenses).where(eq(expenses.id, id));
  await logChange({ tenantId, actor, entityType: 'expense', entityId: id, action: 'deleted', summary: `Removed ${row.category.toLowerCase()} — $${(row.amountCents / 100).toFixed(2)} (${row.spentOn})` });
}

export async function expenseSummary(tenantId: string, from: string, to: string) {
  const rows = await listExpenses(tenantId, from, to);
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amountCents);
  return {
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    count: rows.length,
    byCategory: Array.from(byCategory.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents),
  };
}

/** Month totals for the last `months` months, oldest first (for the trend bars). */
export async function monthlyTotals(tenantId: string, endMonth: string, months = 6) {
  const [y, m] = endMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const rows = await db
    .select({ spentOn: expenses.spentOn, amountCents: expenses.amountCents })
    .from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), gte(expenses.spentOn, start), lte(expenses.spentOn, end)))
    .orderBy(asc(expenses.spentOn));
  const out: { month: string; cents: number }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const key = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    out.push({ month: key, cents: rows.filter((r) => r.spentOn.startsWith(key)).reduce((s, r) => s + r.amountCents, 0) });
  }
  return out;
}
