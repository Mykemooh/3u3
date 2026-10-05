import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { addExpense, expenseSchema, ExpenseError } from '@/lib/expenses';

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = expenseSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add the date, category and amount.' }, { status: 400 });
  try {
    return NextResponse.json({ id: await addExpense(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name }) });
  } catch (err) {
    if (err instanceof ExpenseError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
