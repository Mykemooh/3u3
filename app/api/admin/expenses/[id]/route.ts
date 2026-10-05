import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { updateExpense, deleteExpense, expenseSchema, ExpenseError } from '@/lib/expenses';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = expenseSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add the date, category and amount.' }, { status: 400 });
  try {
    await updateExpense(admin.tenantId, params.id, parsed.data, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ExpenseError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    await deleteExpense(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ExpenseError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
